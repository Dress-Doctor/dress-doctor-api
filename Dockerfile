FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
# NotificationService resolves .hbs templates from `${cwd}/src/static`,
# and I18nModule loads translations from `${cwd}/src/i18n`, not dist,
# at runtime — ship both alongside dist rather than changing that
# resolution (out of scope for Phase 0).
COPY --from=build /app/src/static ./src/static
COPY --from=build /app/src/i18n ./src/i18n

EXPOSE 3000

# Two entrypoints, one image: `api` (default) or `worker`.
CMD ["node", "dist/main"]
