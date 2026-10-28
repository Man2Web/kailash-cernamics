# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM deps AS build
COPY . .
# NEXT_PUBLIC_* values are inlined at build time: pass them as build args / build variables.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ATTENDANCE_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL NEXT_PUBLIC_ATTENDANCE_URL=$NEXT_PUBLIC_ATTENDANCE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app ./
EXPOSE 3000
# Schema migrations are a deliberate deploy step, not run on startup:  npm run db:migrate
CMD ["npm", "start"]
