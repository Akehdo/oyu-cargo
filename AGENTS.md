# AGENTS.md

Общие правила для всех, кто работает с этим репозиторием: людей и ИИ-агентов
(Claude Code, Codex, Copilot и других).

## Авторство и Git

- Единственный автор и контрибьютор проекта — **Ruslan Kadirov**
  (GitHub [@Akehdo](https://github.com/Akehdo), `ruslankadirov1337@gmail.com`).
- Коммиты делаются только от его имени, с настройками `git config user.name` /
  `user.email` этого репозитория. Не меняйте автора или коммиттера.
- В сообщениях коммитов, описаниях pull request, тегах и релизах **запрещены**:
  - трейлеры `Co-Authored-By:` (и любые другие трейлеры с соавторами);
  - строки вроде «Generated with …», «🤖 …», подписи и ссылки на ИИ-инструменты;
  - упоминание ИИ-агента как автора, соавтора или помощника.
- Сообщения коммитов — на английском, в повелительном наклонении, первая строка
  до ~72 символов, в теле — что и зачем изменено.
- Работа идёт в отдельной ветке и попадает в `main` через pull request.
  Push в `main` без запроса владельца, `--force` и переписывание истории — только
  по его прямой просьбе.
- Не коммитьте секреты: `.env`, токены, ключи, дампы базы (`.gitignore` уже
  исключает основные из них).

## Проект

OYU Cargo — карго из Китая в Казахстан с пунктом выдачи в Кокшетау.
Одна платформа на одном домене (https://oyu-cargo.online):

| Каталог | Что внутри |
| --- | --- |
| `crm-backend/` | API на NestJS 11, Prisma + PostgreSQL 16, Redis, Docker Compose, Telegram-бот |
| `crm-frontend/` | Админ-панель (React + Vite) по адресу `/admin` и конфигурация Nginx |
| `crm-client/` | Личный кабинет клиента (React + Vite) в корне `/`, он же Telegram Mini App |

- Роли — одна таблица `users`: `admin` (сотрудники, вход по email) и `user`
  (клиенты, вход по телефону или email, профиль с 5-значным личным кодом).
  Доступ закрыт по умолчанию: эндпоинты помечаются `@AdminOnly()` или `@ClientOnly()`.
- Маршруты кабинета должны совпадать с `crm-frontend/nginx/10-platform-routes.conf`.
- Telegram — **один** бот (`TELEGRAM_BOT_TOKEN`): отчёты для сотрудников в группе и
  уведомления клиентам в личных чатах. Второй бот не заводить. Локальный запуск не
  должен трогать webhook и писать реальным клиентам.
- Стиль: оранжевый `#FF6A13` (градиент до `#FF8A3D`), чёрный и белый; тексты
  интерфейса на русском.
- Описание клиентского API — `crm-backend/docs/client-api.md`; меняете API —
  обновите документ.

## Команды

Каждая часть — отдельный npm-пакет, команды запускаются из её каталога.

```sh
# crm-backend
npm test            # typecheck + node:test (*.spec.ts)
npm run build       # prisma generate + tsc
npx prisma generate # после изменения prisma/schema.prisma (нужен DATABASE_URL)

# crm-frontend, crm-client
npm test            # node:test (tests/*.test.mjs)
npm run build       # typecheck + vite build
npm run dev         # 5173 (админка) / 5174 (кабинет)
```

Весь стек локально: `cd crm-backend && docker compose up -d --build`
(кабинет — `http://localhost:8081/`, админка — `http://localhost:8081/admin`).

Перед pull request прогоните `npm test` и `npm run build` в изменённых пакетах.

## База данных

- Схема меняется только миграциями в `crm-backend/prisma/migrations/`; уже
  применённые миграции не редактируются. На сервере миграции применяются при
  старте контейнера `app` (`prisma migrate deploy`).
- Даты этапов посылки (`parcels.*_at`) ведёт триггер `parcels_status_dates`;
  в коде их не выставлять.
- Миграцию с триггерами или заполнением данных проверяйте на одноразовом
  PostgreSQL 16 до деплоя.

## Сервер

Порядок работы описан в `crm-backend/docs/production-server.md`. Коротко:

- Перед деплоем снимите дамп базы в `/opt/crm/deploy-backups/`.
- Код на сервер переносится через `git bundle`: у сервера нет доступа к
  приватному репозиторию на GitHub.
- Образы собираются по очереди (`docker compose build app`, затем `frontend`),
  потом `docker compose up -d --wait`.
- Никогда не выполнять `docker compose down -v` — это удалит данные.
- `/opt/crm/crm-backend/.env` хранится только на сервере; значения секретов не
  выводить в логи и чат.
