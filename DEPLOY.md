# NAVBAT — botni ishga tushirish

Bu qo‘llanma noldan ishlaydigan Telegram botgacha olib boradi.
Ikki yo‘l bor — ikkalasi ham bir xil kodni ishlatadi:

| Yo‘l | Kimga | Vaqt | Server kerakmi |
| --- | --- | --- | --- |
| [A. Railway](#a-railway--doimiy-ishlaydigan-bot) | doimiy ishlaydigan bot | ~15 daq | yo‘q (Railway beradi) |
| [B. Lokal + tunnel](#b-lokal--tunnel--tez-sinash) | tez sinab ko‘rish | ~5 daq | yo‘q (kompyuteringiz) |

Har ikkalasida ham birinchi qadam bir xil: **bot yaratish**.

---

## 1-qadam: @BotFather da bot yaratish

1. Telegramda [@BotFather](https://t.me/BotFather) ni oching → **Start**
2. `/newbot` yuboring
3. **Bot nomi** — foydalanuvchilar ko‘radigan nom:
   ```
   NAVBAT
   ```
4. **Username** — `bot` bilan tugashi shart va band bo‘lmasligi kerak:
   ```
   navbat_uz_bot
   ```
5. BotFather token beradi — u shunday ko‘rinadi:
   ```
   8123456789:AAHk3l-XyZqWeRtY_uIoPaSdFgHjKlZxCvB
   ```

> ⚠️ **Tokenni hech kimga bermang va gitga yuklamang.** Token — botning paroli.
> Agar tasodifan oshkor bo‘lsa: @BotFather → `/revoke` → yangi token oling.

**Tokenni saqlab qo‘ying** — keyingi qadamda kerak bo‘ladi.

### O‘z Telegram ID’ingizni oling (admin bo‘lish uchun)

[@userinfobot](https://t.me/userinfobot) ga `/start` yuboring — u sizga ID beradi
(masalan `123456789`). Bu ID `ADMIN_TELEGRAM_IDS` ga yoziladi va sizga admin panel ochiladi.

---

## A. Railway — doimiy ishlaydigan bot

Railwayda **bitta servis** ishlaydi: API + Mini App + bot birgalikda. Alohida
frontend hosting, CORS sozlash yoki ikkinchi deploy kerak emas.

### A1. Kodni GitHubga yuklang

```bash
cd navbat
git init
git add .
git commit -m "NAVBAT MVP"
git branch -M main
git remote add origin https://github.com/<sizning-username>/navbat.git
git push -u origin main
```

> `.env` fayli `.gitignore` da — u yuklanmaydi. Bu to‘g‘ri: sirlar Railway
> panelida saqlanadi.

### A2. Railwayda loyiha yarating

1. [railway.app](https://railway.app) → GitHub bilan kiring
2. **New Project** → **Deploy from GitHub repo** → `navbat` reposini tanlang
3. Railway `Dockerfile` ni ko‘radi va o‘zi build qila boshlaydi
   (birinchi build ~3–5 daqiqa)

### A3. Postgres qo‘shing

1. Loyiha ichida **+ New** → **Database** → **Add PostgreSQL**
2. Railway `DATABASE_URL` ni avtomatik yaratadi

Endi uni app servisiga ulaymiz:

1. **navbat** servisini oching → **Variables**
2. **+ New Variable** → **Add Reference** → `Postgres` → `DATABASE_URL`

### A4. Public domen oling

1. **navbat** servisi → **Settings** → **Networking**
2. **Generate Domain** bosing
3. Shunday manzil chiqadi:
   ```
   https://navbat-production-a1b2.up.railway.app
   ```
   Uni nusxalab oling.

### A5. Muhit o‘zgaruvchilarini kiriting

**Variables** bo‘limida quyidagilarni qo‘shing:

| Nomi | Qiymati |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | @BotFather bergan token |
| `SESSION_SECRET` | tasodifiy uzun satr (pastda ko‘rsatilgan) |
| `TELEGRAM_WEBHOOK_SECRET` | tasodifiy satr |
| `PUBLIC_URL` | A4 dagi manzil (oxirida `/` bo‘lmasin) |
| `ADMIN_TELEGRAM_IDS` | sizning Telegram ID’ingiz |
| `NODE_ENV` | `production` |

Tasodifiy satrlarni yarating:

```bash
openssl rand -hex 32    # SESSION_SECRET uchun
openssl rand -hex 24    # TELEGRAM_WEBHOOK_SECRET uchun
```

> Windowsda `openssl` bo‘lmasa:
> ```powershell
> -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
> ```

Saqlaganingizdan keyin Railway avtomatik qayta deploy qiladi.

### A6. Bazani tayyorlang

Deploy tugagach, migratsiyalar **avtomatik** qo‘llanadi (`start:prod` ichida
`prisma migrate deploy` bor). Demo ma’lumot qo‘shmoqchi bo‘lsangiz:

Railway CLI orqali:

```bash
npm i -g @railway/cli
railway login
railway link          # loyihani tanlang
railway run npm run db:seed
```

> Demo ma’lumot **majburiy emas** — bo‘sh baza bilan ham hammasi ishlaydi.
> Real foydalanish uchun seed qilmaslik tavsiya etiladi.

### A7. Botni Mini Appga ulang

Bu bitta buyruq @BotFather dagi barcha qo‘lda sozlashni almashtiradi:

```bash
railway run npm run setup:telegram
```

U quyidagilarni bajaradi:

```
✅ Bot topildi: @navbat_uz_bot
✅ Menyu tugmasi Mini Appga bog‘landi: https://navbat-production-a1b2.up.railway.app
✅ Buyruqlar o‘rnatildi (5 ta)
✅ Bot tavsifi yozildi
✅ Webhook o‘rnatildi: https://navbat-production-a1b2.up.railway.app/telegram/webhook
```

Railway CLI ishlatmoqchi bo‘lmasangiz, xuddi shu skriptni kompyuteringizdan
ishga tushiring — `.env` ga `TELEGRAM_BOT_TOKEN`, `PUBLIC_URL` va
`TELEGRAM_WEBHOOK_SECRET` ni Railwaydagi qiymatlar bilan yozib:

```bash
npm run setup:telegram
```

### A8. Tekshiring

1. Brauzerda `https://<sizning-domen>/health` ni oching:
   ```json
   { "ok": true, "service": "navbat", "bot": "webhook", "web": true }
   ```
2. Telegramda botingizni oching → **/start**
3. **🚀 NAVBATni ochish** tugmasini bosing → Mini App ochiladi

Tayyor. Bot ishlayapti. 🎉

---

## B. Lokal + tunnel — tez sinash

Server sotib olmasdan, haqiqiy Telegramda sinab ko‘rish.

### B1. Talablar

- Node.js 20+
- PostgreSQL 14+ (yoki Docker)

Docker bilan bazani ko‘tarish eng oson:

```bash
docker run -d --name navbat-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=navbat postgres:16-alpine
```

### B2. Loyihani tayyorlang

```bash
cd navbat
npm install
cp .env.example .env
```

`.env` ni tahrirlang:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/navbat?schema=public"
TELEGRAM_BOT_TOKEN="8123456789:AAHk3l-..."     # @BotFather dan
SESSION_SECRET="istalgan-uzun-tasodifiy-satr"
ADMIN_TELEGRAM_IDS="123456789"                 # @userinfobot dan
BOT_MODE="polling"
```

Bazani tayyorlang:

```bash
npm run prisma:migrate
npm run db:seed          # demo ma'lumotlar (ixtiyoriy)
```

### B3. Ishga tushiring

```bash
npm run dev
```

Uchta process ko‘tariladi: API (3001), Mini App (5173), bot (polling).

### B4. Tunnel oching

**Yangi terminalda:**

```bash
npm run tunnel
```

Shunday manzil chiqadi:

```
https://random-words-here.trycloudflare.com
```

### B5. Manzilni ulang

`.env` ga yozing:

```env
WEB_APP_URL="https://random-words-here.trycloudflare.com"
```

`npm run dev` ni qayta ishga tushiring (Ctrl+C → `npm run dev`), so‘ng:

```bash
npm run setup:telegram
```

### B6. Sinang

Telegramda botni oching → `/start` → tugmani bosing.

> Tunnel manzili har safar o‘zgaradi. Yopib qayta ochsangiz, `.env` dagi
> `WEB_APP_URL` ni yangilab, `npm run setup:telegram` ni qayta ishga tushiring.

---

## Boshqa hostinglar

### Render

`render.yaml` kerak emas — Dockerfile yetarli:

1. **New** → **Web Service** → GitHub repo
2. **Runtime**: Docker
3. **Health Check Path**: `/health`
4. PostgreSQL qo‘shing va `DATABASE_URL` ni ulang
5. Muhit o‘zgaruvchilari — Railwaydagi bilan bir xil (`PUBLIC_URL` = Render bergan manzil)

### Fly.io

```bash
fly launch --dockerfile Dockerfile
fly postgres create && fly postgres attach <db-nomi>
fly secrets set TELEGRAM_BOT_TOKEN=... SESSION_SECRET=... \
                TELEGRAM_WEBHOOK_SECRET=... PUBLIC_URL=https://<app>.fly.dev
fly deploy
```

### O‘z VPS’ingiz (Docker Compose)

```bash
cp .env.example .env      # to'ldiring
docker compose up -d --build
```

HTTPS uchun oldiga Caddy yoki Nginx qo‘ying (Telegram HTTPS talab qiladi).
Caddy bilan eng oson:

```
navbat.example.uz {
    reverse_proxy localhost:3001
}
```

---

## Muammolarni bartaraf qilish

### Mini App ochilmayapti / oq ekran

- `PUBLIC_URL` **HTTPS** ekanini tekshiring (Telegram HTTP’ni ochmaydi)
- `PUBLIC_URL` oxirida `/` bo‘lmasin
- `https://<domen>/health` javob beryaptimi?
- `npm run setup:telegram` ni qayta ishga tushiring

### Bot javob bermayapti

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

`last_error_message` ni o‘qing:

| Xato | Sabab | Yechim |
| --- | --- | --- |
| `Wrong response from the webhook: 401` | secret mos emas | `TELEGRAM_WEBHOOK_SECRET` ikkala joyda bir xilmi? `setup:telegram` ni qayta ishga tushiring |
| `Wrong response from the webhook: 503` | bot hali ko‘tarilmagan | 10–20 soniya kuting; loglarni tekshiring |
| `SSL error` / `Connection refused` | domen ishlamayapti | `PUBLIC_URL` va deploy holatini tekshiring |
| bo‘sh `url` | webhook o‘rnatilmagan | `npm run setup:telegram` |

### “Telegram ma’lumotlari tasdiqlanmadi”

Mini App ochiladi, lekin login bo‘lmaydi:

- `TELEGRAM_BOT_TOKEN` API va bot uchun **bir xil** bo‘lishi shart
- Mini App **bot orqali** ochilganmi? (brauzerda to‘g‘ridan-to‘g‘ri ochsangiz
  initData bo‘lmaydi — bu normal)

### Deploy build’da yiqilyapti

- Railway loglarida `npm ci` yoki `prisma generate` xatosini qidiring
- Node 20+ ishlatilyaptimi (`Dockerfile` da `node:22-slim`)

### Baza xatolari

```bash
railway run npx prisma migrate deploy    # migratsiyalarni qo'lda qo'llash
railway run npx prisma studio            # ma'lumotlarni ko'rish
```

---

## Xavfsizlik yodda tutilsin

- `.env` hech qachon gitga tushmasin (`.gitignore` da bor)
- `SESSION_SECRET` va `TELEGRAM_WEBHOOK_SECRET` — har bir muhit uchun alohida
- `ALLOW_INSECURE_AUTH` faqat lokalda; productionda avtomatik o‘chadi
- Token oshkor bo‘lsa: @BotFather → `/revoke` → yangi token → Railway Variables → redeploy
