# crm-client — платформа OYU Cargo (личный кабинет)

Клиентский портал карго (Китай → Казахстан, ПВЗ Кокшетау): регистрация с
получением личного кода, адрес склада в Китае с подставленным кодом,
отслеживание посылок, уведомления, инструкции и тарифы. Личный кабинет открывается на `/`.
Новые клиенты регистрируются на `/register` с email и телефоном. На `/login` клиенты входят по
телефону или email, администраторы — по email. Админ-панель (`../crm-frontend`) живёт на том же домене под
`/admin` и пускает только роль `admin`. Сессия общая (`localStorage`
`oyu.auth.tokens`), поэтому вход один на всю систему.

Адреса кабинета: `/`, `/address`, `/tracks`, `/instructions`, `/profile`,
`/login`, `/register` (`src/layouts/AppLayout.tsx`). Список должен совпадать с
`crm-frontend/nginx/10-platform-routes.conf`, иначе nginx ответит 404.

Стек как у `crm-frontend`: React 18 + Vite 5 + TypeScript + lucide-react, свой
маленький роутер на History API (`src/shared/router.tsx`), обычный CSS.
API — `crm-backend/docs/client-api.md`.

## Разработка

Нужны backend, этот dev-сервер и dev-сервер админки:

```bash
npm --prefix ../crm-frontend run dev   # админка на :5173 (base /admin/)
npm run dev                            # платформа: http://localhost:5174
```

Открывайте всё через `http://localhost:5174`: dev-сервер проксирует `/admin` на
`:5173` и `/api` на backend, поэтому у кабинета и админки один origin и одна сессия.
Адреса меняются через `VITE_DEV_API_TARGET` и `VITE_DEV_ADMIN_TARGET`.

Скрипты: `dev`, `typecheck`, `build` (typecheck + vite build), `preview`.

## Сборка и деплой

Отдельного образа нет: `crm-frontend/Dockerfile` собирает кабинет из этой папки
(build context `portal`) и админку в один nginx-образ. В compose это уже настроено;
вручную:

```bash
docker build --build-context portal=../crm-client -t crm-frontend ../crm-frontend
```

д.

## Где менять контент

**Весь бизнес-контент — в `src/config/content.ts`** (места для заполнения
помечены `TODO`):

- бренд, город, ПВЗ;
- тарифы (цена за кг по весу выдачи, скидка за наличные, пакеты, срок доставки);
- адрес склада в Китае — заполните все пять реквизитов, укажите `{code}`
  в получателе и адресе и после сверки выставьте `warehouse.confirmed`.
  До подтверждения кабинет предлагает обратиться в поддержку;
- YouTube: ссылка на канал и список видео (`youtubeId` пустой → «видео скоро
  появится»; пока нет ни одного видео, показывается текстовая инструкция);
- контакты (WhatsApp, Instagram, адрес и часы ПВЗ);
- условия карго (версия и текст — **сейчас черновик, заменить**).

Подписи статусов посылок и шаги прогресса — `src/config/statuses.ts`.
Цвета бренда и темы — CSS-переменные в начале `src/styles.css`
(`--brand`, `--brand-strong`, `--brand-soft`, `--brand-contrast`, `--brand-gradient`).

## Хранилище браузера

- `oyu.auth.tokens` — пара токенов, общая для кабинета и админки
  (старые `cargo.client.tokens` / `crm.auth.tokens` переносятся автоматически);
- `cargo.client.theme` — выбранная тема (нет ключа → как в системе);
- `cargo.client.tracks.view` — последний фильтр посылок;
- `cargo.client.notifications.seen` — id уведомлений, уже обработанных опросом
  (чтобы не показывать браузерное уведомление повторно).

## Уведомления

Список уведомлений опрашивается каждые 60 с (и при возврате на вкладку).
После разрешения браузерных уведомлений новые непрочитанные показываются через
`Notification`; для Android Chrome регистрируется минимальный service worker
`public/sw.js` (без кэширования). На iPhone уведомления работают только для
сайта, добавленного на экран «Домой».
