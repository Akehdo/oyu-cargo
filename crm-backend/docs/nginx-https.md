# Docker nginx, лимиты и HTTPS

## Локальный запуск (без сервера)

Обычный `docker compose up -d --build` из `crm-backend` запускает CRM на
`http://localhost:8081`. Nginx применяет все лимиты, HTTPS и Certbot не нужны.
Порт доступен только с этого компьютера. Если задан `FRONTEND_PORT`, используется
он вместо 8081. Рабочие Docker volumes PostgreSQL и Redis сохраняются.

Для проверки: `docker compose exec -T frontend nginx -t`,
`curl http://localhost:8081/api/health`.

Серверный файл `docker-compose.production.yml` заменяет порты на 80/443
и добавляет Certbot. Требуется Docker Compose 2.24.4 или новее.

Основной адрес — `https://oyu-cargo.online`. Имя `www.oyu-cargo.online`
перенаправляет на основной адрес с кодом 308, сохраняя путь
и параметры запроса. Docker nginx напрямую принимает
публичные порты 80 и 443. Backend, PostgreSQL и Redis не публикуются на хосте.
Не ставь перед этой конфигурацией другой прокси без отдельной настройки доверенных
IP: лимиты используют адрес TCP-клиента, заголовки X-Forwarded-For от клиента
перезаписываются. Не добавляй `set_real_ip_from 0.0.0.0/0`.

## Лимиты

Все лимиты действуют на IP и используют nginx leaky bucket:

| Запросы | Средняя скорость | Дополнительный всплеск |
| --- | --- | --- |
| Все `/api/` с учётом исключений ниже | 10 запросов/с | 60 |
| POST входа сотрудников, входа и регистрации клиентов | 10 запросов/мин | 4 |
| POST обновления токена сотрудников и клиентов | 30 запросов/мин | 10 |

Для login и refresh одновременно действует общий лимит API. Это не жёсткий
счётчик за календарную минуту: например, после простоя можно сделать 5 попыток
входа сразу, затем восстанавливается примерно одна попытка каждые 6 секунд.
Превышение возвращает JSON с HTTP 429 и `Retry-After: 6`.
Статика, `/health`, GET `/api/health`, OPTIONS и ACME не расходуют лимит.
Состояние общее для workers одного nginx; после пересоздания контейнера сбрасывается.
Настройки: `crm-frontend/nginx/00-rate-limits.conf` и `nginx/app.conf`.

## Перед переключением сервера

1. Для `oyu-cargo.online` и `www.oyu-cargo.online` настрой DNS на сервер CRM.
   Если опубликованы AAAA, проверь доступ к серверу и по IPv6.
2. Разреши входящие TCP 80 и 443 в firewall сервера и облака.
3. Проверь `sudo ss -ltnp '( sport = :80 or sport = :443 )'`.
   Ранее Docker слушал только `127.0.0.1:8081`, теперь ему нужны публичные 80/443.
   Если их занимает системный nginx, сначала выясни, обслуживает ли он другие
   сайты. Для общего сервера нужен отдельный план переноса этих сайтов.
4. Если сервер выделен только под CRM, сохрани `/etc/nginx` и `/etc/letsencrypt`
   перед переключением. Освободи порты, остановив системный nginx непосредственно
   перед запуском Docker. После успешного переноса отключи его автозапуск и
   старый таймер Certbot, если он обслуживал только CRM.
5. Новый Certbot хранит сертификаты в Docker volume `letsencrypt`; сертификаты
   системного Certbot автоматически туда не попадают. Инструкция ниже выпускает
   сертификат в новом хранилище. Не удаляй старые сертификаты до проверки HTTPS.

## Выпуск сертификата

В серверном `.env` задай имена для основного сайта и перенаправления с www:

```dotenv
COMPOSE_FILE=docker-compose.yml:docker-compose.production.yml
CRM_DOMAIN=oyu-cargo.online
CRM_REDIRECT_DOMAINS=www.oyu-cargo.online
CORS_ALLOWED_ORIGINS=https://oyu-cargo.online
```

На новом сервере помести каталоги `crm-frontend`, `crm-client` и `crm-backend`
рядом и запусти production Compose из `crm-backend`:

```bash
docker compose config --quiet
docker compose up -d --build --wait
curl -fsS http://oyu-cargo.online/health
```

До выпуска сертификата nginx принимает запросы HTTP-01 для обоих имён и
возвращает 503 для страниц сайта. Выпусти один сертификат на основной домен
и www. Вместо `YOUR_EMAIL` подставь контактный email для Let's Encrypt:

```bash
docker compose run --rm --no-deps certbot certonly \
  --webroot --webroot-path /var/www/certbot \
  --cert-name oyu-cargo.online -d oyu-cargo.online -d www.oyu-cargo.online \
  --email YOUR_EMAIL --agree-tos --non-interactive
docker compose restart frontend
docker compose exec -T frontend nginx -t
curl -fsS https://oyu-cargo.online/api/health
curl -sSI 'https://www.oyu-cargo.online/admin?x=1'
```

После перезапуска nginx использует файлы из
`/etc/letsencrypt/live/oyu-cargo.online`. Запрос к www должен вернуть `308`
и `Location: https://oyu-cargo.online/admin?x=1`. HTTP-01 остаётся доступен
для обоих имён на порту 80. Запрос с посторонним HTTP Host получает 404,
а TLS-соединение с неизвестным именем SNI отклоняется.

## Автоматическое продление

Из папки `crm-backend`:

```bash
sudo install -d -m 700 /usr/local/lib/crm-certbot
sudo install -m 700 scripts/renew-certificates.sh /usr/local/lib/crm-certbot/renew-certificates.sh
printf 'CRM_COMPOSE_DIR=%s\n' "$(pwd)" | sudo tee /etc/crm-certbot.env >/dev/null
sudo chmod 600 /etc/crm-certbot.env
sudo install -m 644 scripts/systemd/crm-certbot.service /etc/systemd/system/crm-certbot.service
sudo install -m 644 scripts/systemd/crm-certbot.timer /etc/systemd/system/crm-certbot.timer
sudo systemctl daemon-reload
docker compose run --rm --no-deps certbot renew --dry-run
sudo systemctl enable --now crm-certbot.timer
sudo systemctl list-timers crm-certbot.timer
```

Таймер проверяет срок дважды в сутки с небольшим случайным сдвигом. Certbot
продлевает общий сертификат основного сайта и www. Скрипт проверяет конфигурацию
командой `nginx -t` и перезагружает nginx. Сбой продления отражается в статусе systemd. После
обновления скрипта повтори команду `install` выше, чтобы служба запускала
новую версию из `/usr/local/lib/crm-certbot`. Сертификаты
доступны nginx только для чтения; Docker socket не монтируется в контейнеры.

Проверить вручную: `sudo systemctl start crm-certbot.service`.
Журнал: `sudo journalctl -u crm-certbot.service -n 50 --no-pager`.
`docker compose down` сохраняет сертификаты; `down -v` удаляет также базу и
сертификаты, поэтому для обновления его использовать нельзя.

Официальные руководства: [nginx limit_req](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html),
[Certbot webroot и renew](https://eff-certbot.readthedocs.io/en/stable/using.html).

## Локальная проверка конфигурации

Из `crm-backend` при запущенном Docker и установленном OpenSSL:

```bash
docker build --build-context portal=../crm-client -t crm-nginx-check:local ../crm-frontend
node scripts/test-nginx.mjs
```

Тест создаёт отдельную сеть, фиктивный API и временный самоподписанный сертификат.
Проверяет первичный HTTP-запуск, HTTPS, редирект, лимиты, восстановление квоты,
подмену заголовков, ACME и reload. Контейнеры и тестовые ключи удаляются в конце.
Рабочая база и Let's Encrypt не используются. По умолчанию API-заглушка использует
`node:22-alpine`; образ можно задать через `NODE_TEST_IMAGE`.
