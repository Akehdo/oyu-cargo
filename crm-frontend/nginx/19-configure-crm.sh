#!/bin/sh
set -efu
: "${CRM_DOMAIN:=oyu-cargo.online}"
if [ "$CRM_DOMAIN" = oyu-cargo.online ]; then
  : "${CRM_REDIRECT_DOMAINS=www.oyu-cargo.online}"
else
  : "${CRM_REDIRECT_DOMAINS=}"
fi
valid_domain() {
  case "$1" in
    ''|*[!a-z0-9.-]*|.*|*.|-*|*-|*..*|*.-*|*-.*) return 1 ;;
  esac
}
valid_domain "$CRM_DOMAIN" || { echo 'Invalid CRM_DOMAIN' >&2; exit 1; }
for domain in $CRM_REDIRECT_DOMAINS; do
  if ! valid_domain "$domain" || [ "$domain" = "$CRM_DOMAIN" ]; then
    echo 'Invalid hostname in CRM_REDIRECT_DOMAINS' >&2
    exit 1
  fi
done
export CRM_DOMAIN CRM_REDIRECT_DOMAINS
template=/etc/nginx/crm/http.conf.template
case "${CRM_HTTPS_MODE:-off}" in
  off) template=/etc/nginx/crm/local.conf.template ;;
  auto)
    if [ -f "/etc/letsencrypt/live/$CRM_DOMAIN/fullchain.pem" ] &&
       [ -f "/etc/letsencrypt/live/$CRM_DOMAIN/privkey.pem" ]; then
      template=/etc/nginx/crm/https.conf.template
    fi
    ;;
  *) echo 'CRM_HTTPS_MODE must be off or auto' >&2; exit 1 ;;
esac
# Keep nginx variables such as $uri intact.
config=/etc/nginx/conf.d/default.conf
variables='${CRM_DOMAIN} ${CRM_REDIRECT_DOMAINS}'
envsubst "$variables" < "$template" > "$config"
if [ "$template" = /etc/nginx/crm/https.conf.template ] && [ -n "$CRM_REDIRECT_DOMAINS" ]; then
  envsubst "$variables" < /etc/nginx/crm/redirect-http.conf.template >> "$config"
  for domain in $CRM_REDIRECT_DOMAINS; do
    CRM_REDIRECT_NAME="$domain" envsubst '${CRM_DOMAIN} ${CRM_REDIRECT_NAME}' \
      < /etc/nginx/crm/redirect-https.conf.template >> "$config"
  done
fi
nginx -t
