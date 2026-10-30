# API and worker image. Worker command: node apps/api/dist/worker.js
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @roomora/types build && pnpm --filter api build

FROM node:22-slim
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo .
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
