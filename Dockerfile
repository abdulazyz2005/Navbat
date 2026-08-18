# NAVBAT — bitta servis: API + Mini App + Telegram bot
#
# Railway / Render / Fly.io / oddiy VPS uchun bir xil ishlaydi.
#   docker build -t navbat .
#   docker run -p 3001:3001 --env-file .env navbat

FROM node:22-slim AS base
# Prisma va HTTPS so'rovlar uchun kerak
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------------------------------------------------------------- build
FROM base AS build
ENV NODE_ENV=development
COPY . .
# postinstall: @navbat/shared build + prisma generate
RUN npm ci
RUN npm run build

# ------------------------------------------------------------ production
FROM base AS production
ENV NODE_ENV=production
ENV PORT=3001
ENV SERVE_WEB=true

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/bot/package.json ./apps/bot/
COPY --from=build /app/apps/bot/dist ./apps/bot/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migratsiyalarni qo'llab, serverni ishga tushiradi
CMD ["npm", "run", "start:prod"]
