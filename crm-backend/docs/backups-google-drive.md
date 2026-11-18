# Бэкапы PostgreSQL на сервере и в Google Drive

Скрипт `scripts/backup-gdrive.sh` запускается на Linux-сервере с Docker Compose.
Он создаёт сжатый дамп PostgreSQL и проверяет его оглавление. В режиме `gdrive`
также загружает его через rclone и читает обратно для сравнения SHA-256.
CRM продолжает работать. Файл `.uploaded` означает успешную проверку загрузки.
Незавершённые дампы не загружаются; готовые архивы при ошибке остаются на сервере
и повторно отправляются при следующем запуске. Одновременно работает один запуск.

Таймер ниже запускает бэкап ежедневно в 03:00 по Asia/Qyzylorda и догоняет
пропущенный запуск после включения сервера. Google Drive нужно подключить один
раз вручную; копирование файлов в репозиторий само по себе таймер не включает.

## Режим без облака

`CRM_BACKUP_MODE=local` сохраняет дампы только на сервере. Google Drive и rclone
не требуются. Для каждого `.dump` создаётся контрольная сумма в `.dump.sha256`.
Режим `gdrive` (по умолчанию) дополнительно загружает архивы в Google Drive.

Из `/opt/crm/crm-backend` установи скрипт и расписание:

```bash
sudo install -d -m 700 /usr/local/lib/crm-backup
sudo install -m 700 scripts/backup-gdrive.sh /usr/local/lib/crm-backup/backup-gdrive.sh
sudo install -m 600 scripts/backup.env.example /etc/crm-backup.env
sudo nano /etc/crm-backup.env
```

Укажи в `/etc/crm-backup.env`:

```dotenv
CRM_COMPOSE_DIR=/opt/crm/crm-backend
CRM_BACKUP_DIR=/var/backups/crm/postgres
CRM_BACKUP_MODE=local
```

Настройки `CRM_BACKUP_REMOTE` и `RCLONE_CONFIG` в этом режиме не используются.
Затем проверь первую копию и включи ежедневный запуск в 03:00 по Кызылорде:

```bash
sudo install -m 644 scripts/systemd/crm-backup.service /etc/systemd/system/crm-backup.service
sudo install -m 644 scripts/systemd/crm-backup.timer /etc/systemd/system/crm-backup.timer
sudo systemctl daemon-reload
sudo systemctl start crm-backup.service
sudo journalctl -u crm-backup.service -n 50 --no-pager
sudo systemctl enable --now crm-backup.timer
sudo systemctl list-timers crm-backup.timer
```

Архивы сохраняются в `/var/backups/crm/postgres`, доступны только root и
автоматически не удаляются. Это копии на том же сервере: при потере сервера
они тоже могут быть потеряны. Для подключения облака позже выполни шаги ниже,
измени `CRM_BACKUP_MODE=gdrive` в `/etc/crm-backup.env` и запусти службу ещё раз.
Она загрузит и ранее созданные локальные дампы. Не заменяй настроенный `.env`
примером повторно.

## 1. Подключить Google Drive на сервере

Для Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y rclone util-linux
sudo rclone config
```

В мастере:

1. Создай подключение (`n`) с именем `gdrive`.
2. Выбери тип `drive` (Google Drive).
3. `client_id` и `client_secret` оставь пустыми для встроенного клиента rclone.
4. Для `scope` выбери `drive.file`: доступ только к файлам, созданным этим приложением.
5. `service_account_file` оставь пустым, расширенную настройку пропусти.
6. На сервере без браузера ответь `n` на автоматическую авторизацию.
7. Установи [rclone на свой компьютер](https://rclone.org/downloads/) и выполни
   **точную команду `rclone authorize ...`, которую покажет сервер**. Версии rclone
   на сервере и компьютере желательно использовать одинаковые.
8. В браузере войди в нужный Google-аккаунт и разреши доступ. Полученный токен
   вставь непосредственно в терминал сервера в поле `config_token`, не в чат.
9. Для личного диска откажись от Shared Drive и сохрани подключение.

Настройка через `sudo` нужна потому, что таймер запускается от root. Проверь путь:

```bash
sudo rclone config file
sudo chmod 600 /root/.config/rclone/rclone.conf
sudo rclone mkdir gdrive:CRM-backups/postgres
sudo rclone lsd gdrive:CRM-backups
```

Если `config file` показал другой путь, используй его и в `chmod`, и в
`RCLONE_CONFIG` ниже. Папку создаёт rclone: с `drive.file` папка, ранее созданная
вручную в браузере, может быть недоступна приложению.

Описание авторизации: [rclone Remote Setup](https://rclone.org/remote_setup/).
Описание области доступа: [rclone Google Drive](https://rclone.org/drive/).

## 2. Установить скрипт и проверить первую копию

Обнови файлы проекта на сервере, затем из папки `crm-backend` выполни:

```bash
sudo install -d -m 700 /usr/local/lib/crm-backup
sudo install -m 700 scripts/backup-gdrive.sh /usr/local/lib/crm-backup/backup-gdrive.sh
sudo install -m 600 scripts/backup.env.example /etc/crm-backup.env
sudo nano /etc/crm-backup.env
```

Укажи фактический **абсолютный путь** к папке `crm-backend`, содержащей
`docker-compose.yml` и рабочий `.env`, в `CRM_COMPOSE_DIR`. В примере это
`/opt/crm/crm-backend`. Для нескольких серверов задай каждому отдельную папку
`CRM_BACKUP_REMOTE`. Остальные значения можно оставить из примера.

```bash
sudo install -m 644 scripts/systemd/crm-backup.service /etc/systemd/system/crm-backup.service
sudo install -m 644 scripts/systemd/crm-backup.timer /etc/systemd/system/crm-backup.timer
sudo systemctl daemon-reload
sudo systemctl start crm-backup.service
sudo journalctl -u crm-backup.service -n 50 --no-pager
sudo rclone lsl gdrive:CRM-backups/postgres
```

Успешный запуск заканчивается строкой `Backup completed successfully.`.
Проверь наличие `.dump` в Google Drive, затем включи расписание:

```bash
sudo systemctl enable --now crm-backup.timer
sudo systemctl list-timers crm-backup.timer
```

Повторная ручная копия: `sudo systemctl start crm-backup.service`.
Ошибки: `sudo systemctl status crm-backup.service` и `sudo journalctl -u crm-backup.service`.
Остановка расписания: `sudo systemctl disable --now crm-backup.timer`.
После изменения скрипта в проекте повтори команду `install` для скрипта.

## Что сохраняется

Дамп содержит схему и данные одной базы: пользователей, выдачи, посылки, расходы,
транзакции и историю Prisma-миграций. Он не включает роли всего кластера, `.env`,
исходники, Docker-образы и Redis. `.env` и конфигурацию rclone сохрани отдельно в
защищённом месте: они нужны для восстановления настроек и содержат секреты.

Архивы сжаты, но **не зашифрованы**. Папку Drive не делай общедоступной.
Скрипт сохраняет все копии и ничего автоматически не удаляет. Контролируй свободное
место на сервере и квоту Google Drive; политику удаления можно настроить отдельно.
Проверка загрузки скачивает весь архив обратно и расходует трафик.
Telegram-уведомления о бэкапах в этот скрипт не включены; ошибки видны в systemd.

## Проверить восстановление без изменения рабочей базы

Проверка оглавления и SHA-256 не заменяет пробное восстановление. Периодически
выбирай архив из Drive и восстанавливай его в отдельную временную базу.
На сервере из папки `crm-backend`, заменив `ИМЯ_АРХИВА.dump` на реальное имя:

```bash
(
  set -eu
  umask 077
  restore_dir="$(mktemp -d)"
  sudo rclone copyto 'gdrive:CRM-backups/postgres/ИМЯ_АРХИВА.dump' "$restore_dir/restore.dump"
  # sudo rclone создаёт файл от root; чтение ниже тоже выполняется через sudo.
  test_db="crm_restore_test_$(date +%Y%m%d_%H%M%S)"
  sudo docker compose exec -T postgres sh -c \
    'createdb -U "$POSTGRES_USER" "$1"' sh "$test_db"
  sudo cat "$restore_dir/restore.dump" | sudo docker compose exec -T postgres sh -c \
    'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges --exit-on-error --single-transaction' sh "$test_db"
  printf 'Восстановлено в тестовую базу: %s\nАрхив: %s\n' "$test_db" "$restore_dir/restore.dump"
)
```

Команда завершится ошибкой, если база с таким именем уже существует. Рабочая база
не перезаписывается. Проверь таблицы и данные в тестовой базе; после проверки
удали именно эту тестовую базу и временный архив, чтобы освободить место.
Восстановление рабочей базы выполняется отдельно с остановкой записи в CRM.

## Retention and encryption

- `CRM_BACKUP_KEEP_DAYS` (default 14): local archives older than this are deleted. In
  `gdrive` mode only archives with a verified `.uploaded` marker are removed, and the newest
  archive is always kept, so a broken upload never deletes the only copy.
- `CRM_BACKUP_REMOTE_KEEP_DAYS` (default 90): `rclone delete --min-age` removes older
  `crm_*.dump` files from the remote folder. Set `0` to keep everything.
- Dumps contain password hashes and client phone numbers. Encrypt them before they leave the
  server with an rclone **crypt** remote layered over the Drive remote:
  `rclone config` → new remote `gdrive-crypt`, type `crypt`, remote
  `gdrive:CRM-backups-encrypted`, then set `CRM_BACKUP_REMOTE=gdrive-crypt:postgres`.
  Store the crypt passwords outside the server (a password manager): without them the
  backups cannot be restored.
