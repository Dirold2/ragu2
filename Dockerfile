# Базовый образ
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apt-get update && apt-get install -y openssl

# Копируем исходный код в контейнер
COPY . /app
WORKDIR /app

# Устанавливаем только production-зависимости
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Устанавливаем все зависимости и собираем проект
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpx prisma generate
RUN pnpm run build

# Финальный образ
FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/build /app/build
COPY .env /app/.env
EXPOSE 3000
CMD ["pnpm", "start"]
