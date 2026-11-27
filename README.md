# OYU Cargo

Исходный код CRM и клиентского кабинета OYU Cargo. Все три части проекта находятся в одном репозитории.

| Каталог | Содержимое |
| --- | --- |
| [crm-backend](crm-backend/README.md) | API на NestJS, миграции PostgreSQL, Redis и Docker Compose |
| [crm-frontend](crm-frontend/README.md) | Админ-панель и конфигурация Nginx |
| [crm-client](crm-client/README.md) | Личный кабинет клиента |

### Запуск через Docker Compose

В каталоге `crm-backend` создайте локальный `.env`. Обязательные переменные перечислены в [docker-compose.yml](crm-backend/docker-compose.yml). Для сборки обеих веб-панелей Compose использует соседние каталоги из этого репозитория.

```sh
cd crm-backend
docker compose config --quiet
docker compose up -d --build
```

По умолчанию кабинет доступен по адресу `http://localhost:8081/`, админ-панель — по адресу `http://localhost:8081/admin`.

Инструкции по эксплуатации находятся в [описании рабочего сервера](crm-backend/docs/production-server.md) и [руководстве по резервному копированию](crm-backend/docs/backups-google-drive.md).
