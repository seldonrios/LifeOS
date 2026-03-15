FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=deps /app /app
CMD ["pnpm", "--filter", "@lifeos/feature-flags-service", "run", "start"]