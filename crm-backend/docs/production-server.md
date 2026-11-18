# Сервер CRM

- Основной сайт — https://oyu-cargo.online
- `www.oyu-cargo.online` перенаправляет на основной сайт
- IP: `104.207.93.110`
- ОС: Ubuntu 24.04
- SSH: `ssh -p 22022 root@104.207.93.110`
- Проект: `/opt/crm`, backend: `/opt/crm/crm-backend`
- Настройки: `/opt/crm/crm-backend/.env` (не добавлять в Git)
- Вход в админ-панель: https://oyu-cargo.online/admin. Email администратора задаётся серверной настройкой `SEED_ADMIN_EMAIL`.

Сервер использует новую базу. Локальные записи не импортировались.
Публичные порты: 80 и 443. PostgreSQL, Redis и API доступны внутри Docker.
Серверный `.env` задаёт `COMPOSE_FILE=docker-compose.yml:docker-compose.production.yml`.
Основной сайт и www используют один сертификат. Порядок выпуска и проверки
описан в [инструкции HTTPS](nginx-https.md).

Команды на сервере:

```bash
cd /opt/crm/crm-backend
docker compose ps
docker compose logs --tail=100 app frontend
docker compose exec -T frontend nginx -t
systemctl list-timers crm-certbot.timer
journalctl -u crm-certbot.service -n 50 --no-pager
```

После переноса изменённых исходников в `/opt/crm` обновлять образы последовательно:

```bash
docker compose build app
docker compose build frontend
docker compose up -d --wait
```

Данные остаются в Docker volumes. Не использовать `docker compose down -v`.
Для сервера с 2 ГБ RAM добавлен swap `/swapfile-crm` размером 2 ГБ.
Инструкция резервного копирования: [Google Drive](backups-google-drive.md).
