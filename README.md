# NAVBAT

**Vaqtingiz yo‘qmi?** Navbatda siz uchun kutadigan odam toping.
**Bo‘sh vaqtingiz bormi?** Boshqalar uchun navbat kutib pul ishlang.

NAVBAT — Telegram Mini App ko‘rinishidagi ikki tomonlama marketplace. Platforma ikki fuqaro
o‘rtasidagi **qonuniy xizmat kelishuvini** tashkil qiladi: buyurtmachi ↔ navbat kutuvchi.

> **Huquqiy pozitsiya.** Platforma davlatning rasmiy navbat tizimini almashtirmaydi, rasmiy
> elektron talonni boshqa shaxsga o‘tkazishni avtomatlashtirmaydi, davlat tizimlariga
> avtomatlashtirilgan kirish qilmaydi va shaxsiy tibbiy ma’lumot / login-parol so‘ramaydi.
> Faqat qonuniy tarzda bajarilishi mumkin bo‘lgan **jismoniy kutish va yordam xizmatlari**
> moslashtiriladi.

### 🚀 Botni ishga tushirmoqchimisiz?

**[DEPLOY.md](./DEPLOY.md)** — noldan ishlaydigan Telegram botgacha bosqichma-bosqich:
@BotFather da bot yaratish, Railwayga deploy, yoki lokal + tunnel bilan tez sinash.

---

## Arxitektura: bitta servis

Production’da hammasi **bitta processda** ishlaydi:

```
                    ┌─────────────────────────────────┐
   Telegram ───────▶│  POST /telegram/webhook         │  bot (grammY)
                    │  ─────────────────────────────  │
   Mini App ───────▶│  GET  /            → index.html │  React SPA
   (WebView)        │  GET  /assets/*    → static     │
                    │  ─────────────────────────────  │
                    │  POST /api/orders  → REST API   │  Express + Prisma
                    └─────────────────────────────────┘
                                    │
                              PostgreSQL
```

Nega shunday: bitta domen, bitta deploy, CORS muammosi yo‘q, Mini App va API
har doim bir xil versiyada bo‘ladi. Lokal ishlab chiqishda Vite alohida ishlaydi
va `/api` ni backendga proxy qiladi — shu tufayli devda ham bitta origin.

Alohida hosting kerak bo‘lsa (frontend Vercel, backend boshqa joyda):
`SERVE_WEB=false` va frontendda `VITE_API_URL=https://api.example.com`.

---

## Mundarija

1. [Tez ishga tushirish](#1-tez-ishga-tushirish)
2. [Telegram bot va Mini App sozlash](#2-telegram-bot-va-mini-app-sozlash)
3. [Loyiha strukturasi](#3-loyiha-strukturasi)
4. [Database schema](#4-database-schema)
5. [API hujjati](#5-api-hujjati)
6. [Muhit o‘zgaruvchilari](#6-muhit-ozgaruvchilari)
7. [Demo ma’lumotlar va ssenariy](#7-demo-malumotlar-va-ssenariy)
8. [Testlar](#8-testlar)
9. [Biznes mantiq: pul, matching, holatlar](#9-biznes-mantiq)
10. [Xavfsizlik](#10-xavfsizlik)
11. [Deployment](#11-deployment)
12. [Texnik qarorlar](#12-texnik-qarorlar)

---

## 1. Tez ishga tushirish

### Talablar

- Node.js **20+**
- PostgreSQL **14+**

### Qadamlar

```bash
# 1. Bog'liqliklarni o'rnatish
npm install

# 2. Muhit faylini tayyorlash
cp .env.example .env
#    .env ichida kamida DATABASE_URL va TELEGRAM_BOT_TOKEN ni to'ldiring

# 3. Prisma client generatsiyasi
npm run prisma:generate

# 4. Migratsiya (bazani yaratadi)
npm run prisma:migrate

# 5. Demo ma'lumotlar
npm run db:seed

# 6. Hammasini birga ishga tushirish (api + web + bot)
npm run dev
```

Ishga tushgandan keyin:

| Xizmat   | Manzil                                        |
| -------- | --------------------------------------------- |
| Mini App | http://localhost:5173                         |
| API      | http://localhost:5173/api → 3001 ga proxy      |
| Bot      | Telegram (long polling, `BOT_MODE=polling`)   |

Alohida ishga tushirish:

```bash
npm run dev:api    # faqat backend
npm run dev:web    # faqat frontend
npm run dev:bot    # faqat bot
npm run tunnel     # HTTPS tunnel (Telegramda sinash uchun)
```

### Production build

```bash
npm run build      # shared → bot → api → web
npm run serve      # bitta servis: API + Mini App + bot
```

`npm run serve` dan keyin hammasi bitta manzilda: http://localhost:3001

### Telegramga ulash

```bash
npm run setup:telegram
```

Bitta buyruq @BotFather dagi qo‘lda sozlashning hammasini bajaradi: menyu tugmasini
Mini Appga bog‘laydi, buyruqlar va tavsifni yozadi, webhook o‘rnatadi.
Batafsil: **[DEPLOY.md](./DEPLOY.md)**

### Brauzerda test qilish (Telegramsiz)

Telegram ichiga kirmasdan lokal test qilish uchun `.env` ga qo‘shing:

```env
ALLOW_INSECURE_AUTH=true
VITE_DEV_TELEGRAM_ID=100000001     # seeddagi Abdulaziz (admin)
VITE_DEV_TELEGRAM_NAME="Abdulaziz"
```

Bu rejimda frontend `dev:{...}` ko‘rinishidagi soxta initData yuboradi va backend uni
faqat `ALLOW_INSECURE_AUTH=true` bo‘lganda qabul qiladi. **Productionda hech qachon
yoqmang** — `NODE_ENV=production` bo‘lganda bu bayroq avtomatik o‘chadi.

Navbatchi sifatida ko‘rish uchun `VITE_DEV_TELEGRAM_ID=100000006` (Ali).

---

## 2. Telegram bot va Mini App sozlash

Bosqichma-bosqich to‘liq qo‘llanma: **[DEPLOY.md](./DEPLOY.md)**

Qisqacha:

1. **Bot yarating** — [@BotFather](https://t.me/BotFather) → `/newbot` → tokenni oling
2. **Tokenni `.env` ga yozing**:
   ```env
   TELEGRAM_BOT_TOKEN="8123456789:AAHk3l-..."
   ```
3. **HTTPS manzil oling** — Telegram Mini App faqat HTTPS’ni ochadi:
   - production: Railway/Render bergan domen → `PUBLIC_URL`
   - lokal test: `npm run tunnel` → olingan manzil → `WEB_APP_URL`
4. **Botni ulang**:
   ```bash
   npm run setup:telegram
   ```

`setup:telegram` skripti @BotFather ichida qo‘lda bosiladigan sozlamalarning
hammasini bajaradi:

| Amal | Telegram API metodi |
| --- | --- |
| Menyu tugmasini Mini Appga bog‘lash | `setChatMenuButton` |
| Buyruqlar ro‘yxati | `setMyCommands` |
| Bot tavsifi va “about” matni | `setMyDescription`, `setMyShortDescription` |
| Webhook + secret token | `setWebhook` |

### Admin sozlash

O‘z Telegram ID’ingizni [@userinfobot](https://t.me/userinfobot) dan oling:

```env
ADMIN_TELEGRAM_IDS="123456789,987654321"
```

**Admin panel Mini Appdan BUTUNLAY ajratilgan.** U alohida ilova:

- manzil: `https://<domen>/admin` — oddiy brauzerda, kompyuter ekraniga moslangan
- alohida bundle: Mini App kodida admin komponentlari umuman yo‘q
- kirish: Telegramda botga `/admin` yuboriladi → bot bir martalik kod va havola beradi
  (kod 10 daqiqa yashaydi va faqat bir marta ishlaydi)
- token `scope='admin'` bilan beriladi va 12 soat amal qiladi

Mini App tokeni admin endpointlariga **hech qachon** o‘tmaydi — foydalanuvchi admin
bo‘lsa ham `403 ADMIN_SESSION_REQUIRED` qaytadi.

### Bot buyruqlari

| Buyruq          | Vazifasi                      |
| --------------- | ----------------------------- |
| `/start`        | Mini Appni ochish             |
| `/balans`       | Balansni ko‘rish              |
| `/topshiriqlar` | Faol topshiriqlar             |
| `/lokatsiya`    | Joylashuv yuborish (check-in) |
| `/yordam`       | Yordam                        |
| `/admin`        | faqat admin — panelga kirish kodi |

Bundan tashqari bot **chek rasmini** qabul qiladi: foydalanuvchi to‘lov chekini
botga yuborsa, u faol to‘lovga avtomatik biriktiriladi va adminlarga tugmalar bilan
yuboriladi (✅ Pul keldi / ❌ Kelmadi).

### Bot rejimlari

| `BOT_MODE` | Qachon | Izoh |
| --- | --- | --- |
| `webhook` | production | Telegram `/telegram/webhook` ga POST qiladi. `PUBLIC_URL` + `TELEGRAM_WEBHOOK_SECRET` kerak. API bilan bir processda. |
| `polling` | lokal dev | Bot Telegramdan o‘zi so‘rab turadi. HTTPS kerak emas. |
| `off` | — | Bot bu processda ishlamaydi. |

Bo‘sh qoldirilsa: productionda `webhook`, devda `off` (alohida `npm run dev:bot`).

Webhook xavfsizligi: Telegram har so‘rovda `X-Telegram-Bot-Api-Secret-Token`
sarlavhasini yuboradi. Server uni **constant-time** solishtiradi; mos kelmasa `401`,
bot hali ko‘tarilmagan bo‘lsa `503` (so‘rov osilib qolmaydi).


## 3. Loyiha strukturasi

```
navbat/
├── apps/
│   ├── api/                    Express + TypeScript backend
│   │   └── src/
│   │       ├── env.ts          muhit o'zgaruvchilari validatsiyasi
│   │       ├── app.ts          Express app: /api + Mini App + webhook
│   │       ├── server.ts       HTTP server + bot ishga tushirish + cron
│   │       ├── telegram.ts     botni API processiga ulash, webhook guard
│   │       ├── lib/
│   │       │   ├── prisma.ts       Prisma client (pg driver adapter)
│   │       │   ├── telegram-auth.ts initData HMAC validatsiyasi
│   │       │   ├── session.ts      stateless sessiya tokeni
│   │       │   └── dto.ts          DB -> API mapperlar
│   │       ├── middleware/     auth, error, rate-limit
│   │       ├── payments/       provider abstraksiyasi + MockPaymentProvider
│   │       ├── services/       orders, feed, ledger, disputes, notifications
│   │       └── routes/         auth, users, orders, availability, payments,
│   │                           balance, disputes, notifications, admin
│   ├── bot/                    grammY Telegram bot
│   │   └── src/
│   │       ├── bot.ts          createBot() — handlerlar (qayta ishlatiladi)
│   │       ├── index.ts        alohida process, long polling (dev)
│   │       └── config.ts       .env ni ildizdan topish
│   └── web/                    React + Vite + Tailwind Mini App
│       └── src/
│           ├── lib/            api client, telegram SDK, format
│           ├── hooks/          useAuth, useViewMode
│           ├── components/     Layout, OrderCard, ui kit
│           └── pages/          Onboarding, Home, CreateOrder, Feed,
│                               OrderDetail, Availability, Chat, Balance,
│                               Profile, Notifications, Admin
├── packages/
│   └── shared/                 frontend + backend uchun umumiy TypeScript
│       └── src/
│           ├── enums.ts        enumlar + o'zbekcha yorliqlar
│           ├── money.ts        komissiya, reyting (butun sonli arifmetika)
│           ├── matching.ts     matching engine
│           ├── state-machine.ts order/payment holat mashinalari
│           ├── errors.ts       xato kodlari -> o'zbekcha xabarlar
│           └── types.ts        DTO tiplari
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/index.ts
├── scripts/
│   └── setup-telegram.ts       botni Mini Appga avtomatik ulash
├── tests/
│   ├── unit.test.ts            komissiya, matching, holat mashinalari
│   ├── integration.test.ts     to'liq buyurtma hayot sikli
│   └── security.test.ts        initData, ownership, role escalation
├── Dockerfile                  bitta servis (API + Mini App + bot)
├── docker-compose.yml          lokal to'liq stack (app + Postgres)
├── railway.json                Railway deploy konfiguratsiyasi
├── .env.example
├── DEPLOY.md                   botni ishga tushirish qo'llanmasi
└── README.md
```

TypeScript tiplari `@navbat/shared` orqali frontend va backendda **bir xil** ishlatiladi —
enum qiymati, xato kodi yoki DTO maydonini o‘zgartirsangiz, ikkala tomon ham compile
vaqtida xato beradi.

---

## 4. Database schema

PostgreSQL + Prisma ORM. **Barcha pul summalari `Int` (so‘m).** Floating point ishlatilmaydi.
Reyting ham integer: `4.9` → `490` (`RATING_SCALE = 100`).

| Jadval          | Vazifasi                                                          |
| --------------- | ----------------------------------------------------------------- |
| `users`         | Telegram foydalanuvchilari (telegramId unique)                    |
| `profiles`      | rol rejimi, reyting, balans, statistika                           |
| `orders`        | buyurtmalar (kategoriya, joy, sana/vaqt, summa, status)           |
| `availability`  | navbatchining bo‘sh vaqti (sana, vaqt, koordinata, radius, min)   |
| `assignments`   | buyurtma ↔ navbatchi bog‘lanishi (accepted/started/completed)     |
| `payments`      | escrow to‘lovlar (gross / fee / worker, status, provider, txId)   |
| `transactions`  | balans harakati jurnali (har o‘zgarish hujjatlashtiriladi)        |
| `ratings`       | 1–5 baho + izoh (bitta buyurtmaga bitta baho)                     |
| `messages`      | matched tomonlar o‘rtasidagi chat                                 |
| `disputes`      | nizolar (sabab, holat, admin qarori)                              |
| `withdrawals`   | pul yechish so‘rovlari (manual payout)                            |
| `notifications` | ilova ichidagi bildirishnomalar                                   |
| `check_ins`     | proof-of-presence (arrival / periodic / completion + koordinata)  |

Migratsiya: `prisma/migrations/00000000000000_init/migration.sql`

```bash
npm run prisma:migrate     # dev (yangi migratsiya yaratadi)
npm run prisma:deploy      # production (mavjud migratsiyalarni qo'llaydi)
npm run prisma:studio      # ma'lumotlarni brauzerda ko'rish
npm run db:reset           # bazani tozalab qayta yaratish
```

---

## 5. API hujjati

Barcha API yo'llari **`/api`** prefiksi ostida (Mini App bilan bitta originni
baham ko'rgani uchun).

| Muhit | Base URL |
| --- | --- |
| lokal dev | `http://localhost:5173/api` (Vite → 3001 ga proxy) |
| production | `https://<domen>/api` |

Autentifikatsiya: `Authorization: Bearer <sessiya_tokeni>`

Prefikssiz ikkita yo'l bor:

| Yo'l | Vazifasi |
| --- | --- |
| `GET /health` | healthcheck (Railway/Docker shuni tekshiradi) |
| `POST /telegram/webhook` | Telegram yangiliklari (secret token bilan himoyalangan) |

### Auth

| Metod  | Endpoint          | Tavsif                                              |
| ------ | ----------------- | --------------------------------------------------- |
| `POST` | `/auth/telegram`  | `{ initData }` → `{ token, expiresIn }`             |

### Users

| Metod   | Endpoint             | Tavsif                                     |
| ------- | -------------------- | ------------------------------------------ |
| `GET`   | `/users/me`          | profil, balans, o‘qilmagan bildirishnomalar|
| `PATCH` | `/users/me`          | `roleMode`, `onboarded`, `city`, `phone`   |
| `GET`   | `/users/:id`         | ochiq profil                               |
| `GET`   | `/users/:id/ratings` | olingan baholar                            |

### Orders

| Metod  | Endpoint                  | Tavsif                                             |
| ------ | ------------------------- | -------------------------------------------------- |
| `POST` | `/orders`                 | buyurtma yaratish (DRAFT + PENDING payment)        |
| `GET`  | `/orders?role=&status=`   | mening buyurtmalarim / topshiriqlarim              |
| `GET`  | `/orders/feed?...`        | navbatchi uchun mos topshiriqlar (matching)        |
| `GET`  | `/orders/:id`             | buyurtma tafsilotlari                              |
| `PATCH`| `/orders/:id`             | tahrirlash (faqat DRAFT)                           |
| `POST` | `/orders/:id/pay`         | escrow to‘lov → **PUBLISHED**                      |
| `POST` | `/orders/:id/raise-price` | taklifni oshirish (dynamic price)                  |
| `POST` | `/orders/:id/accept`      | navbatchi qabul qiladi → **MATCHED**               |
| `POST` | `/orders/:id/start`       | ishni boshlash + check-in → **IN_PROGRESS**        |
| `POST` | `/orders/:id/checkin`     | davomiy tasdiqlash                                 |
| `GET`  | `/orders/:id/checkins`    | check-in tarixi                                    |
| `POST` | `/orders/:id/complete`    | navbatchi yakunladi → **COMPLETION_PENDING**       |
| `POST` | `/orders/:id/confirm`     | buyurtmachi tasdiqladi → **COMPLETED** + RELEASED  |
| `POST` | `/orders/:id/cancel`      | bekor qilish                                       |
| `POST` | `/orders/:id/dispute`     | «Muammo bor» → **DISPUTED**                        |
| `POST` | `/orders/:id/rate`        | 1–5 baho                                           |

**Feed query parametrlari:** `category`, `date`, `minAmount`, `maxDistanceKm`,
`sort` (`best_match` | `nearest` | `highest_pay` | `newest`), `all`, `page`, `limit`.

### Availability / Chat / Balance

| Metod    | Endpoint                  | Tavsif                        |
| -------- | ------------------------- | ----------------------------- |
| `POST`   | `/availability`           | «Men bo‘shman»                |
| `GET`    | `/availability`           | bo‘sh vaqtlarim (+ mos soni)  |
| `DELETE` | `/availability/:id`       | o‘chirish                     |
| `GET`    | `/orders/:id/messages`    | chat tarixi                   |
| `POST`   | `/orders/:id/messages`    | xabar yuborish                |
| `GET`    | `/balance`                | mavjud / kutilayotgan balans  |
| `GET`    | `/balance/transactions`   | tranzaksiyalar (pagination)   |
| `POST`   | `/withdrawals`            | pul yechish so‘rovi           |
| `GET`    | `/withdrawals`            | so‘rovlar tarixi              |
| `POST`   | `/withdrawals/:id/cancel` | so‘rovni bekor qilish         |

### Payments / Disputes / Notifications

| Metod  | Endpoint                | Tavsif                                     |
| ------ | ----------------------- | ------------------------------------------ |
| `POST` | `/payments/create`      | `{ orderId }` → balansdan escrow to‘lov    |
| `POST` | `/payments/intents`     | `{ amount, orderId? }` → karta + unikal summa |
| `GET`  | `/payments/intents/active` | tugallanmagan to‘lov (bo‘lsa)           |
| `POST` | `/payments/intents/:id/receipt` | chek rasmini yuklash               |
| `GET`  | `/payments/intents/:id` | to‘lov holati (faqat egasi)                |
| `GET`  | `/payments/:id`         | to‘lov (faqat egalari)                     |
| `POST` | `/payments/:id/release` | to‘lovni chiqarish (faqat buyurtmachi)     |
| `GET`  | `/disputes`             | mening nizolarim                           |
| `GET`  | `/notifications`        | bildirishnomalar                           |
| `POST` | `/notifications/read`   | hammasini o‘qilgan deb belgilash           |

### Admin (faqat admin panel sessiyasi bilan)

| Metod  | Endpoint                          | Tavsif                             |
| ------ | --------------------------------- | ---------------------------------- |
| `GET`  | `/admin/stats`                    | platforma analitikasi              |
| `GET`  | `/admin/users?q=`                 | foydalanuvchilar                   |
| `POST` | `/admin/users/:id/ban`            | bloklash / blokdan chiqarish       |
| `GET`  | `/admin/orders?status=`           | barcha buyurtmalar                 |
| `GET`  | `/admin/payments?status=`         | to‘lovlar, GMV, komissiya          |
| `GET`  | `/admin/disputes?status=`         | nizolar                            |
| `POST` | `/admin/disputes/:id/resolve`     | `{ winner, resolution }`           |
| `GET`  | `/admin/withdrawals?status=`      | pul yechish so‘rovlari             |
| `POST` | `/admin/withdrawals/:id/decide`   | manual payout qarori               |
| `GET`  | `/admin/intents?status=`          | karta to‘lovlari (chek bilan)      |
| `GET`  | `/admin/intents/:id/receipt`      | chek rasmi                         |
| `POST` | `/admin/intents/:id/confirm`      | pul keldi → balansga qo‘shiladi    |
| `POST` | `/admin/intents/:id/reject`       | `{ reason }` — rad etish           |
| `GET`  | `/admin/settings`                 | platforma kartasi                  |
| `PUT`  | `/admin/settings/card`            | kartani o‘zgartirish               |
| `POST` | `/admin/maintenance/expire-orders`| muddati o‘tganlarni tozalash       |
| `POST` | `/admin/session`                  | kirish kodi → admin tokeni (ochiq) |

### Xatolar

Barcha xatolar bir xil formatda qaytadi va frontend kodni o‘zbekcha matnga aylantiradi:

```json
{ "error": { "code": "ORDER_ALREADY_ACCEPTED", "message": "Bu topshiriqni boshqa navbatchi allaqachon qabul qilgan." } }
```

| Kod                         | HTTP | Xabar                                                    |
| --------------------------- | ---- | -------------------------------------------------------- |
| `INVALID_INIT_DATA`         | 401  | Telegram ma’lumotlari tasdiqlanmadi                      |
| `USER_BANNED`               | 403  | Hisobingiz bloklangan                                    |
| `ORDER_ALREADY_ACCEPTED`    | 409  | Bu topshiriqni boshqa navbatchi allaqachon qabul qilgan  |
| `ORDER_EXPIRED`             | 409  | Bu topshiriqning vaqti o‘tib ketgan                      |
| `INSUFFICIENT_BALANCE`      | 400  | Balansingizda yetarli mablag‘ yo‘q                       |
| `ILLEGAL_ORDER_TRANSITION`  | 409  | Bu amalni buyurtmaning hozirgi holatida bajarib bo‘lmaydi|
| `NOT_ORDER_PARTICIPANT`     | 403  | Siz bu buyurtmaning ishtirokchisi emassiz                |
| `RATE_LIMITED`              | 429  | Juda ko‘p so‘rov yuborildi                               |

To‘liq ro‘yxat: `packages/shared/src/errors.ts`

---

## 6. Muhit o‘zgaruvchilari

`.env.example` faylidan nusxa oling: `cp .env.example .env`

### Majburiy

| O‘zgaruvchi | Tavsif |
| --- | --- |
| `DATABASE_URL` | PostgreSQL ulanish satri |
| `TELEGRAM_BOT_TOKEN` | @BotFather tokeni (productionda majburiy) |
| `SESSION_SECRET` | sessiya tokenlarini imzolash kaliti (`openssl rand -hex 32`) |

### Bitta servis (production)

| O‘zgaruvchi | Standart | Tavsif |
| --- | --- | --- |
| `PUBLIC_URL` | Railwayda avtomatik | servisning public HTTPS manzili |
| `TELEGRAM_WEBHOOK_SECRET` | — | webhook himoyasi (`openssl rand -hex 24`) |
| `BOT_MODE` | prod: `webhook`, dev: `off` | `webhook` \| `polling` \| `off` |
| `SERVE_WEB` | prod: `true` | Mini Appni shu server bersinmi |
| `PORT` | `3001` | Railway/Render o‘zi beradi |

### Biznes

| O‘zgaruvchi | Standart | Tavsif |
| --- | --- | --- |
| `PLATFORM_FEE_PERCENT` | `10` | platforma komissiyasi |
| `MIN_ORDER_AMOUNT` | `10000` | minimal buyurtma summasi (UZS) |
| `MIN_WITHDRAWAL_AMOUNT` | `50000` | minimal pul yechish summasi |
| `PAYMENT_PROVIDER` | `mock` | `mock` yoki real provayder |
| `ADMIN_TELEGRAM_IDS` | — | vergul bilan admin ID’lari |

### Lokal dev

| O‘zgaruvchi | Standart | Tavsif |
| --- | --- | --- |
| `WEB_APP_URL` | `PUBLIC_URL` | bot ochadigan manzil (tunnel URL) |
| `VITE_API_URL` | bo‘sh (bir origin) | alohida hostingda API manzili |
| `ALLOW_INSECURE_AUTH` | `false` | Telegramsiz brauzerda test |
| `VITE_DEV_TELEGRAM_ID` | — | qaysi seed foydalanuvchi sifatida kirish |

> ⚠️ **`NODE_ENV` ni `.env` ga yozmang.** Vite uni build paytida ham o‘qiydi va
> `development` bo‘lsa React’ning development versiyasi bundlega tushadi —
> hajmi 2× oshadi va har bir API so‘rovi ikki marta yuboriladi. `NODE_ENV` ni
> host beradi (Docker/Railway → `production`). Build buni tekshiradi va
> `.env` da `NODE_ENV=development` topsa, aniq xato bilan to‘xtaydi.

Production start paytida tekshiriladi va yo‘q bo‘lsa server ko‘tarilmaydi:
`TELEGRAM_BOT_TOKEN`, o‘zgartirilgan `SESSION_SECRET`, webhook rejimida
`PUBLIC_URL` (HTTPS) va `TELEGRAM_WEBHOOK_SECRET`.

---

## 7. Demo ma’lumotlar va ssenariy

```bash
npm run db:seed
```

Yaratiladi: **10 foydalanuvchi** (5 buyurtmachi + 5 navbatchi, 1 admin), **17 buyurtma**
(barcha statuslarda), **6 bo‘sh vaqt**, **10 reyting**, **17 tranzaksiya**, **3 nizo**,
**3 pul yechish so‘rovi**, **20 chat xabari**.

| Foydalanuvchi | telegram_id | Rol            | Izoh              |
| ------------- | ----------- | -------------- | ----------------- |
| Abdulaziz     | `100000001` | Buyer + Worker | **admin**         |
| Dilnoza       | `100000002` | Buyer          |                   |
| Sardor        | `100000003` | Buyer          |                   |
| Nilufar       | `100000004` | Buyer          |                   |
| Jasur         | `100000005` | Buyer + Worker |                   |
| Ali           | `100000006` | Worker         | ★4.9 · 47 ta ish  |
| Malika        | `100000007` | Worker         |                   |
| Bekzod        | `100000008` | Worker         |                   |
| Shahnoza      | `100000009` | Worker         |                   |
| Rustam        | `100000010` | Worker         |                   |

### Demo ssenariy (seed avtomatik tayyorlaydi)

```
Buyurtmachi: Abdulaziz          Navbatchi: Ali
Kardiolog navbati               Bo'sh vaqt: seed kunidan +3 kun
Chilonzor poliklinikasi         13:30–17:00, Chilonzor, 5 km
+3 kun · 14:30–16:00            minimal to'lov 30 000
50 000 UZS
```

Bosqichlar:

| # | Amal                                  | Natija                                       |
| - | ------------------------------------- | -------------------------------------------- |
| 1 | Abdulaziz buyurtma yaratadi + to‘laydi| `PUBLISHED`, payment `HELD` (55 000)         |
| 2 | Ali feedda ko‘radi                    | **Moslik: 99%**, masofa hisoblangan          |
| 3 | Ali qabul qiladi                      | `MATCHED`, Ali pending balans +50 000        |
| 4 | Ali check-in + ishni boshlaydi        | `IN_PROGRESS`, koordinata + masofa saqlanadi |
| 5 | Ali yakunlaydi                        | `COMPLETION_PENDING`                         |
| 6 | Abdulaziz tasdiqlaydi                 | `COMPLETED`, payment `RELEASED`              |
| 7 | Balanslar                             | Ali **+50 000**, platforma **+5 000**        |
| 8 | Ikki tomon baholaydi                  | reytinglar yangilanadi                       |

Bu ssenariy `tests/integration.test.ts` da avtomatik test sifatida ham bajariladi.

---

## 8. Testlar

```bash
npm test              # hammasi
npm run test:watch    # watch rejimi
```

Testlar alohida bazada ishlaydi (standart: `navbat_test`). Boshqa baza ishlatish uchun:

```bash
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/navbat_test" npm test
```

Test bazasini tayyorlash:

```bash
createdb navbat_test
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/navbat_test" npm run prisma:deploy
```

### Qamrov (121 test)

**Unit (30)** — `tests/unit.test.ts`

- komissiya hisobi (50 000 to‘lov → 5 000 xizmat haqi → navbatchiga 45 000),
  yaxlitlash, butun sonlik, “komissiya + navbatchi ulushi = to‘langan summa”
- reyting o‘rtachasi, muvaffaqiyat foizi, ishonchlilik ballari
- matching engine: vaqt kesishuvi, Haversine masofa, radius, minimal to‘lov, ball 0..100
- order va payment holat mashinalari (ruxsat etilgan / etilmagan o‘tishlar)

**Integration (21)** — `tests/integration.test.ts`

- to‘liq hayot sikli: yaratish → to‘lov → qabul → chat → check-in → boshlash →
  yakunlash → tasdiqlash → RELEASED → balans → baholash
- escrow: pending ↔ available balans harakati, tranzaksiya jurnali
- bekor qilish va qaytarish (buyurtmachi / navbatchi)
- dynamic price (taklifni oshirish)
- nizo ochish va adminning ikki tomonlama qarori
- matching feed: filtrlash, saralash, mos kelmaydiganlarni yashirish
- pul yechish: blokirovka, yetarsiz mablag‘, minimal summa, bekor qilish

**To‘lov va admin (18)** — `tests/payments.test.ts`

- unikal summa: ikkita faol to‘lov hech qachon bir xil summaga ega bo‘lmaydi
- bitta foydalanuvchida bir vaqtda faqat bitta faol to‘lov
- chek yuklash → admin tasdig‘i → balans; ikki marta tasdiqlansa pul takrorlanmaydi
- rad etish: pul qo‘shilmaydi, sabab foydalanuvchiga ko‘rinadi
- begona odam boshqaning to‘loviga chek biriktira olmaydi / ko‘ra olmaydi
- to‘lov tasdiqlangach buyurtma avtomatik PUBLISHED bo‘ladi
- Mini App tokeni admin endpointga o‘tmaydi (`ADMIN_SESSION_REQUIRED`)
- admin kirish kodi bir marta ishlaydi
- payout: karta profilda saqlanadi, admin navbatida ko‘rinadi, “to‘landi” belgilanadi

**Bot (13)** — `tests/bot.test.ts`

Soxta Telegram Bot API serveri ko‘tariladi va grammY o‘sha manzilga yo‘naltiriladi —
shu tufayli to‘liq zanjir tekshiriladi: `update → handler → DB → Telegramga javob`.

- `/start` — salomlashish + Mini App tugmasi (`web_app` URL to‘g‘riligi)
- HTTPS bo‘lmasa oddiy URL tugmasiga o‘tishi
- `/balans` — ro‘yxatdan o‘tmagan foydalanuvchi va real balans
- `/topshiriqlar` — faol buyurtmalar ro‘yxati va bo‘sh holat
- `/lokatsiya` — joylashuv so‘rash tugmasi va maqsadini tushuntirish
- lokatsiya check-in: faol topshiriq bo‘lmasa **saqlanmaydi**, bo‘lsa yoziladi
- webhook: `BOT_MODE=off` da yo‘l ochilmaydi, healthcheck rejimni ko‘rsatadi

**Security (37)** — `tests/security.test.ts`

- initData: soxta hash, boshqa token bilan imzo, o‘zgartirilgan `user_id`, muddati o‘tgan
- sessiya: tokensiz, soxta imzo, payload almashtirish (boshqa foydalanuvchiga o‘tish)
- ownership: begona odam to‘lay/tasdiqlay/chat o‘qiy olmaydi
- to‘lov egaligi: navbatchi o‘zi to‘lovni chiqara olmaydi
- role escalation: admin endpointlari, `isAdmin`/`balance`/`rating` ni PATCH orqali
  o‘zgartirishga urinish
- holat mashinasi: to‘lanmaganni qabul qilish, boshlanmaganni yakunlash, ikki marta to‘lov
- input validation: SQL injection, XSS, uzun matn, noto‘g‘ri koordinata, manfiy/kasrli summa

---

## 9. Biznes mantiq

### 9.1. Pul

```
platform_fee  = offered_amount * PLATFORM_FEE_PERCENT / 100   (pastga yaxlitlanadi)
worker_amount = offered_amount - platform_fee
buyer_total   = offered_amount
```

Misol: `50 000` taklif → buyurtmachi **aynan 50 000** to‘laydi, platforma `5 000`
xizmat haqi ushlaydi, navbatchi **45 000** oladi.

> Komissiya buyurtmachining ustiga qo‘shilmaydi — u e’londa ko‘rgan summani
> to‘laydi. Xizmat haqi navbatchining ulushidan ushlanadi.

**Floating point ishlatilmaydi.** Hamma summa `Int` (so‘m). `calculatePrice()` kasrli yoki
manfiy summani rad etadi. Komissiya pastga yaxlitlanadi — foydalanuvchi hech qachon
ortiqcha to‘lamaydi.

### 9.2. Karta-karta to‘lov (yarim avtomatik escrow)

Uzbekistonda merchant hisobisiz to‘lovni tekshirishning yagona ishonchli yo‘li —
**unikal summa**. Har bir to‘lovga tizim boshqa hech kimda bo‘lmagan summa beradi:

```
Foydalanuvchi 50 000 to'lamoqchi
      ↓
Tizim beradi: karta 8600 **** **** 1234  +  AYNAN 50 137 so'm
      ↓ foydalanuvchi pul o'tkazadi va chek rasmini yuklaydi
payment_intent PENDING_REVIEW  → adminlarga chek + [✅ Pul keldi] [❌ Kelmadi]
      ↓ admin tasdiqlaydi
+50 137 balansga  → buyurtma uchun bo'lsa, buyurtma AVTOMATIK e'lon qilinadi
```

Nima uchun unikal summa: karta-karta o‘tkazmada izoh maydoni yo‘q, shuning uchun
pulni faqat summa orqali aniq ajratish mumkin. Bir vaqtning o‘zida ikkita faol
to‘lov bir xil summaga ega bo‘lolmaydi — buni DB darajasidagi partial unique index
kafolatlaydi (`payment_intents_active_amount_key`).

Himoyalar:

- admin ikki marta bossa ham pul **ikki marta qo‘shilmaydi** (holat atomar o‘zgaradi)
- begona odam boshqaning to‘loviga chek biriktira olmaydi va uni ko‘rmaydi
- chek rasmi 2 MB dan katta bo‘lsa rad etiladi, brauzerda oldindan siqiladi
- to‘lov so‘rovi 60 daqiqadan keyin `EXPIRED` bo‘ladi
- botdagi tugmalar bosilganda foydalanuvchi DB’da qayta `isAdmin` deb tekshiriladi

Pul chiqarish (payout) ham shu tarzda: navbatchi kartasini profilda saqlaydi,
so‘rov yuboradi (summa darhol bloklanadi), admin panelda karta va summa nusxalash
tugmalari bilan ko‘rinadi; pul o‘tkazilgach “✅ To‘ladim” bosiladi.

### 9.2.1. Escrow oqimi

```
Buyurtma yaratildi        payment PENDING
      ↓ to'lov
Balansdan yechiladi       payment HELD      ← pul platformada saqlanadi
      ↓ navbatchi qabul qildi
                          navbatchi pending balansi +worker_amount
      ↓ buyurtmachi tasdiqladi
                          payment RELEASED
                          pending -worker_amount, available +worker_amount
```

Har bir balans o‘zgarishi `transactions` jadvaliga yoziladi (`TASK_INCOME`,
`PLATFORM_FEE`, `ORDER_PAYMENT`, `TOP_UP`, `REFUND`, `WITHDRAWAL`), shuning uchun
balansni tranzaksiyalar yig‘indisidan qayta hisoblash mumkin.

### 9.3. Matching engine

Avval SQL filtri (sana, status, kategoriya, summa), keyin deterministik ball:

```
match_score = time_match     * 35
            + location_match * 30
            + distance_score * 20
            + rating_score   * 10
            + price_score    * 5
```

Har bir komponent `0..1`, natija `0..100` integer. Topshiriq **eligible** hisoblanadi,
agar: sana mos + vaqt kesishuvi > 0 + radius ichida + minimal to‘lovdan kam emas.
ML ishlatilmaydi — natija takrorlanuvchan va tushuntirilishi mumkin.

### 9.4. Holat mashinasi

```
DRAFT → PUBLISHED → MATCHED → IN_PROGRESS → COMPLETION_PENDING → COMPLETED

Xato holatlar: CANCELLED · DISPUTED · REFUNDED · EXPIRED
Maxsus yo'l:   MATCHED → PUBLISHED   (navbatchi voz kechdi)
```

Backend ruxsat etilmagan o‘tishni **rad etadi** (`ILLEGAL_ORDER_TRANSITION`, HTTP 409).
Buyurtmani qabul qilish `UPDATE ... WHERE status='PUBLISHED'` orqali atomar bajariladi —
ikki navbatchi bir vaqtda bosса, faqat bittasi yutadi.

To‘lov: `PENDING → PAID → HELD → RELEASED`, `HELD → REFUNDED`.
`RELEASED` yakuniy holat — undan qaytish yo‘q.

### 9.5. Bekor qilish siyosati

- Buyurtmachi `DRAFT`/`PUBLISHED` holatida **jarimasiz** bekor qiladi, pul qaytariladi
- `MATCHED` dan keyin bekor qilsa — `cancelledOrders` oshadi
- Navbatchi voz kechsa — buyurtma qayta `PUBLISHED` bo‘ladi, uning `cancelledOrders` oshadi
- Ko‘p bekor qiladiganlar `reliabilityScore` bo‘yicha pastga tushadi

### 9.6. Ishonch tizimi

Profilda: ⭐ reyting · ✅ tugallangan · 📊 muvaffaqiyat foizi · ❌ bekor qilishlar.
Reyting `1–5` yulduz, integer shkalada saqlanadi (`4.9` → `490`), o‘rtacha butun sonli
arifmetikada qayta hisoblanadi.

---

## 10. Xavfsizlik

| Chora                          | Amalga oshirilishi                                              |
| ------------------------------ | --------------------------------------------------------------- |
| initData validatsiyasi         | HMAC-SHA256 (`WebAppData` secret), `timingSafeEqual`, `auth_date`|
| Frontend user_id’ga ishonmaslik| foydalanuvchi **faqat** imzolangan initData ichidan olinadi      |
| Sessiya                        | HMAC bilan imzolangan stateless token, muddat bilan              |
| Rol tekshiruvi                 | `requireAuth` + `requireAdmin` middleware                        |
| Buyurtma egaligi               | har bir amalda buyer/worker tekshiriladi                         |
| To‘lov egaligi                 | payer/receiver/admin’dan boshqa hech kim ko‘rmaydi               |
| Balans himoyasi                | balans/reyting/isAdmin `PATCH /users/me` orqali o‘zgarmaydi      |
| Rate limiting                  | umumiy 240/min, auth 30/min, yozuv 60/min                        |
| Input validation               | barcha endpointlarda Zod sxemalari                               |
| SQL injection                  | Prisma parametrlangan so‘rovlar, raw SQL yo‘q                    |
| XSS                            | React avtomatik escape, `dangerouslySetInnerHTML` ishlatilmaydi  |
| CSRF                           | cookie ishlatilmaydi — token `Authorization` headerda            |
| Xavfsizlik headerlari          | Helmet                                                           |
| Payload cheklovi               | JSON body max 256 KB                                             |
| Sirlar                         | bot token va payment credentiallar faqat backendda               |

**Lokatsiya.** Foydalanuvchi ruxsatisiz yig‘ilmaydi. Frontend Telegram `LocationManager`
yoki brauzer Geolocation API’sini **faqat foydalanuvchi tugmani bosganda** chaqiradi,
ruxsat berilmasa oqim davom etadi. Lokatsiya ikki maqsadda ishlatiladi: matching va
check-in.

---

## 11. Deployment

To‘liq bosqichma-bosqich qo‘llanma: **[DEPLOY.md](./DEPLOY.md)**

### Railway (tavsiya etilgan)

Bitta servis — `Dockerfile` orqali. `railway.json` allaqachon sozlangan:
healthcheck `/health`, start `npm run start:prod` (migratsiyalar avtomatik).

```
1. GitHubga push qiling
2. Railway → New Project → Deploy from GitHub repo
3. + New → Database → PostgreSQL  (DATABASE_URL avtomatik)
4. Settings → Networking → Generate Domain
5. Variables: TELEGRAM_BOT_TOKEN, SESSION_SECRET,
              TELEGRAM_WEBHOOK_SECRET, PUBLIC_URL,
              ADMIN_TELEGRAM_IDS, NODE_ENV=production
6. railway run npm run setup:telegram
```

### Docker (VPS yoki lokal)

```bash
docker compose up -d --build     # app + Postgres
```

Yoki faqat app:

```bash
docker build -t navbat .
docker run -p 3001:3001 --env-file .env navbat
```

HTTPS uchun oldiga Caddy/Nginx qo‘ying — Telegram HTTPS talab qiladi.

### Alohida hosting (frontend Vercel + backend boshqa joyda)

Bitta servis majburiy emas:

```
Frontend (Vercel/Cloudflare Pages)
  Build:  npm run build -w @navbat/shared && npm run build -w @navbat/web
  Output: apps/web/dist
  Env:    VITE_API_URL=https://api.example.com
  SPA:    barcha yo'llarni index.html ga yo'naltiring

Backend
  Env:    SERVE_WEB=false
          CORS_ORIGINS=https://mini-app.example.com
          WEB_APP_URL=https://mini-app.example.com
```

### Migratsiyalar

Konteyner startida `prisma migrate deploy` avtomatik ishlaydi (`start:prod`).
Qo‘lda: `npx prisma migrate deploy`.

---

## 12. Texnik qarorlar

Spetsifikatsiyada ochiq qoldirilgan joylarda **eng sodda va xavfsiz** variant tanlandi:

**To‘lov.** Real provayder credentiallari berilmagani uchun `MockPaymentProvider`
ishlatiladi. U charge / hold / release / refund hayot siklini to‘liq simulyatsiya qiladi.
Real provayder ulash uchun `PaymentProvider` interfeysini implement qilib,
`apps/api/src/payments/index.ts` dagi registrga qo‘shish va `PAYMENT_PROVIDER` ni
o‘zgartirish kifoya — biznes mantiqqa tegilmaydi.

**Buyurtmachi balansi.** To‘lov paytida yetishmagan summa provayder orqali yechiladi va
ichki balansga `TOP_UP` sifatida yoziladi, so‘ng buyurtmaga sarflanadi. Shu tufayli
qaytarish (refund) va nizo yechimlari bir xil mexanizm orqali ishlaydi.

**Chat.** MVPda Mini App ichida REST + yengil polling (8 s). WebSocket keyingi bosqichda —
hozircha infratuzilmani murakkablashtirmaydi. Chat faqat `MATCHED` bo‘lgan tomonlar
o‘rtasida ochiladi.

**Bildirishnomalar.** Har bir hodisa `notifications` jadvaliga yoziladi va Telegram Bot API
orqali yuboriladi. Bot tokeni yo‘q bo‘lsa (lokal dev) faqat DBga yoziladi — oqim buzilmaydi.

**Periodic verification.** Backend check-in yozuvlarini (turi, vaqt, koordinata, masofa)
saqlashga to‘liq tayyor. MVPda tasdiqlashni foydalanuvchi ilovadan yoki bot orqali
(`/lokatsiya`) yuboradi; background push keyingi bosqichda.

**Muddati o‘tgan buyurtmalar.** Sanasi o‘tgan va qabul qilinmagan buyurtmalar har soatda
`EXPIRED` qilinadi va pul buyurtmachiga qaytariladi
(`POST /admin/maintenance/expire-orders` orqali qo‘lda ham ishga tushiriladi).

**Bitta servis.** Production’da API, Mini App va bot bitta processda ishlaydi.
Sabab: Telegram Mini App uchun bitta HTTPS domen kifoya, CORS sozlash shart emas,
frontend va backend versiyalari hech qachon ajralib qolmaydi va deploy bitta.
Alohida hosting ham qo‘llab-quvvatlanadi (`SERVE_WEB=false` + `VITE_API_URL`).

**Webhook vs polling.** Productionda webhook: Telegram o‘zi POST qiladi, servis
uxlab yotgan holatda ham resurs sarflamaydi va Railway’da qo‘shimcha worker kerak
emas. Lokalda polling: HTTPS va tunnel kerak emas. `BOT_MODE` bilan boshqariladi.
Webhook `X-Telegram-Bot-Api-Secret-Token` orqali himoyalangan va bot hali
ko‘tarilmagan bo‘lsa so‘rov osilib qolmasdan `503` qaytaradi.

**Prisma driver adapter.** Prisma `driverAdapters` + `engineType = "client"` rejimida
ishlaydi va `pg` drayveri orqali ulanadi. Bu Rust query engine binarini yo‘q qiladi:
konteyner hajmi kichrayadi va Railway/Render/Fly.io kabi platformalarda binar mosligi
muammosi chiqmaydi. Prisma Client API o‘zgarmagan.

**Reyting integer.** `4.9` → `490` (`RATING_SCALE = 100`). O‘rtacha butun sonli
arifmetikada hisoblanadi — pul kabi, yaxlitlash xatolari yo‘q.

---

## Litsenziya

Xususiy loyiha.
