// Build first: docker build --build-context portal=../crm-client -t crm-nginx-check:local ../crm-frontend
// No production services or Let's Encrypt requests are used by this test.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import https from 'node:https';

const image = process.env.NGINX_TEST_IMAGE || 'crm-nginx-check:local';
const nodeImage = process.env.NODE_TEST_IMAGE || 'node:22-alpine';
const prefix = `crm-nginx-test-${process.pid}`;
const directory = mkdtempSync(join(tmpdir(), 'crm-nginx-test-'));
const containers = [];
const domain = 'oyu-cargo.online';
const www = 'www.oyu-cargo.online';
const unknownHost = 'other.example';
let trustedCertificate;
function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
const docker = (...args) => command('docker', args);
function start(name, args) {
  containers.push(name);
  docker('run', '-d', '--name', name, '--network', prefix, ...args);
}
function port(name, internal) {
  return Number(docker('port', name, `${internal}/tcp`).split(':').at(-1));
}
function request(portNumber, path, secure = false, headers = {}, method = 'GET', servername = headers.host ?? domain) {
  const host = headers.host ?? domain;
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request({
      hostname: '127.0.0.1', port: portNumber, path, method,
      headers: { host, ...headers },
      servername, ca: trustedCertificate, agent: false,
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('HTTP timeout')));
    req.end();
  });
}
async function ready(portNumber) {
  for (let i = 0; i < 50; i++) {
    try { if ((await request(portNumber, '/health')).status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('nginx did not become ready');
}
async function checkProductionHttpHosts(portNumber) {
  assert.equal((await request(portNumber, '/health', false, { host: '127.0.0.1' })).status, 200);
  for (const path of ['/', '/health', '/.well-known/acme-challenge/probe']) {
    const response = await request(portNumber, path, false, { host: unknownHost });
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.location, undefined);
  }
}
try {
  docker('network', 'create', prefix);
  const certificates = join(directory, 'certificates');
  const webroot = join(directory, 'webroot');
  mkdirSync(join(webroot, '.well-known', 'acme-challenge'), { recursive: true });
  writeFileSync(join(webroot, '.well-known', 'acme-challenge', 'probe'), 'acme-ok');
  const openssl = process.env.OPENSSL_BIN || (process.platform === 'win32'
    ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl');
  const live = join(certificates, 'live', domain);
  mkdirSync(live, { recursive: true });
  command(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', `/CN=${domain}`, '-addext', `subjectAltName=DNS:${domain},DNS:${www}`,
    '-keyout', join(live, 'privkey.pem'), '-out', join(live, 'fullchain.pem')]);
  trustedCertificate = readFileSync(join(live, 'fullchain.pem'));

  const bootstrap = `${prefix}-bootstrap`;
  start(bootstrap, ['-e', 'CRM_HTTPS_MODE=auto', '-p', '127.0.0.1::80', '-v', `${webroot}:/var/www/certbot:ro`, image]);
  const bootstrapPort = port(bootstrap, 80);
  await ready(bootstrapPort);
  assert.equal((await request(bootstrapPort, '/')).status, 503);
  await checkProductionHttpHosts(bootstrapPort);
  for (const host of [domain, www]) {
    assert.equal((await request(bootstrapPort, '/.well-known/acme-challenge/probe', false, { host })).body, 'acme-ok');
  }
  console.log('PASS: bootstrap serves ACME before certificate issuance');

  start(`${prefix}-app`, ['--network-alias', 'app', '--entrypoint', 'node', nodeImage, '-e',
    'require("http").createServer((req,res)=>{res.setHeader("Content-Type","application/json");res.end(JSON.stringify({path:req.url,ip:req.headers["x-forwarded-for"]}));}).listen(8080,"0.0.0.0")']);
  const local = `${prefix}-local`;
  start(local, ['-p', '127.0.0.1::80', image]);
  const localPort = port(local, 80);
  await ready(localPort);
  assert.equal((await request(localPort, '/')).status, 200);
  assert.equal((await request(localPort, '/api/records')).status, 200);
  const localBurst = await Promise.all(Array.from({ length: 120 }, () => request(localPort, '/api/records')));
  assert.ok(localBurst.some(res => res.status === 429));
  console.log('PASS: local HTTP serves CRM and enforces limits without certificates');
  const page = await request(localPort, '/');
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.equal(page.headers['x-frame-options'], 'DENY');
  // The cabinet may be framed only by Telegram Web (Mini App).
  assert.match(page.headers['content-security-policy'] ?? '', /frame-ancestors https:\/\/web\.telegram\.org"?$/);
  assert.equal(page.headers['cache-control'], 'no-cache');
  const asset = await request(localPort, '/assets/missing.js');
  assert.equal(asset.headers['x-content-type-options'], 'nosniff');
  console.log('PASS: security headers are sent on pages and assets');
  for (const path of ['/', '/login', '/tracks', '/admin', '/admin/clients']) {
    assert.equal((await request(localPort, path)).status, 200, path);
  }
  for (const path of ['/nope', '/admin/nope', '/administrator']) {
    const missing = await request(localPort, path);
    assert.equal(missing.status, 404, path);
    assert.match(missing.body, /<div id="root">/, '404 page is the platform app');
  }
  assert.equal((await request(localPort, '/client/tracks')).status, 301);
  // The admin panel never embeds frames; the cabinet allows YouTube only.
  const adminCsp = (await request(localPort, '/admin')).headers['content-security-policy'] ?? '';
  assert.ok(!adminCsp.includes('frame-src') && adminCsp.includes("frame-ancestors 'none'"));
  assert.match((await request(localPort, '/')).headers['content-security-policy'] ?? '', /frame-src https:\/\/www\.youtube-nocookie\.com/);
  console.log('PASS: platform routes: cabinet at /, admin at /admin, real 404s');
  const name = `${prefix}-tls`;
  start(name, ['-e', 'CRM_HTTPS_MODE=auto', '-p', '127.0.0.1::80', '-p', '127.0.0.1::443',
    '-v', `${certificates}:/etc/letsencrypt:ro`, '-v', `${webroot}:/var/www/certbot:ro`, image]);
  const httpPort = port(name, 80);
  const tlsPort = port(name, 443);
  await ready(httpPort);
  await checkProductionHttpHosts(httpPort);
  const deepLink = '/admin/clients?from=www&tab=details';
  for (const host of [domain, www]) {
    const redirect = await request(httpPort, deepLink, false, { host });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, `https://${domain}${deepLink}`);
    assert.equal((await request(httpPort, '/.well-known/acme-challenge/probe', false, { host })).body, 'acme-ok');
  }
  const wwwRedirect = await request(tlsPort, deepLink, true, { host: www });
  assert.equal(wwwRedirect.status, 308);
  assert.equal(wwwRedirect.headers.location, `https://${domain}${deepLink}`);
  for (const servername of [unknownHost, '']) {
    await assert.rejects(request(tlsPort, '/', true, { host: domain }, 'GET', servername),
      /unrecognized[ _]name|SSL alert number 112/i);
  }
  for (const servername of [domain, www]) {
    const wrongHost = await request(tlsPort, '/', true, { host: unknownHost }, 'GET', servername);
    assert.equal(wrongHost.status, 404);
    assert.equal(wrongHost.headers.location, undefined);
  }
  assert.equal((await request(tlsPort, '/', true)).status, 200);
  const api = await request(tlsPort, '/api/records', true, { 'x-forwarded-for': '1.2.3.4' });
  assert.equal(api.status, 200);
  assert.equal(JSON.parse(api.body).path, '/records');
  assert.notEqual(JSON.parse(api.body).ip, '1.2.3.4');
  console.log('PASS: HTTPS, redirect, API proxy and forwarded-header sanitization');

  const login = [];
  for (let i = 0; i < 10; i++) {
    login.push(await request(tlsPort, i % 2 ? '/api/auth/login?x=1' : '/api/auth/%6cogin', true,
      { 'x-forwarded-for': `198.51.100.${i + 1}` }, 'POST'));
  }
  assert.equal(login.filter(res => res.status === 200).length, 5);
  assert.equal(login.filter(res => res.status === 429).length, 5);
  assert.equal(login.at(-1).headers['retry-after'], '6');
  assert.equal(JSON.parse(login.at(-1).body).statusCode, 429);
  console.log('PASS: login burst is bounded despite changing headers, query strings and encoding');

  await new Promise(resolve => setTimeout(resolve, 6200));
  assert.equal((await request(tlsPort, '/api/auth/login', true, {}, 'POST')).status, 200);
  const refresh = [];
  for (let i = 0; i < 12; i++) {
    refresh.push(await request(tlsPort, '/api/auth/refresh', true, {}, 'POST'));
  }
  assert.equal(refresh.filter(res => res.status === 200).length, 11);
  assert.equal(refresh.at(-1).status, 429);
  console.log('PASS: login capacity recovers and refresh has its own stricter limit');

  const burst = await Promise.all(Array.from({ length: 120 }, () => request(tlsPort, '/api/records', true)));
  assert.ok(burst.some(res => res.status === 429));
  assert.equal((await request(tlsPort, '/api/health', true)).status, 200);
  assert.equal((await request(tlsPort, '/api/records', true, {}, 'OPTIONS')).status, 200);
  assert.equal((await request(httpPort, '/.well-known/acme-challenge/probe')).body, 'acme-ok');
  docker('exec', name, 'nginx', '-t');
  docker('exec', name, 'nginx', '-s', 'reload');
  console.log('PASS: general API limit, probe/preflight exemptions, ACME and nginx reload');
} catch (error) {
  for (const name of containers) {
    const logs = spawnSync('docker', ['logs', '--tail', '15', name], { encoding: 'utf8' });
    console.error(logs.stdout, logs.stderr);
  }
  throw error;
} finally {
  for (const name of containers.reverse()) spawnSync('docker', ['rm', '-f', name]);
  spawnSync('docker', ['network', 'rm', prefix]);
  rmSync(directory, { recursive: true, force: true });
}
