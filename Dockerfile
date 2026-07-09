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

RUN apk add --no-cache logrotate

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
# NotificationService resolves .hbs templates from `${cwd}/src/static`,
# and I18nModule loads translations from `${cwd}/src/i18n`, not dist,
# at runtime — ship both alongside dist rather than changing that
# resolution (out of scope for Phase 0).
COPY --from=build /app/src/static ./src/static
COPY --from=build /app/src/i18n ./src/i18n

COPY docker/logrotate.conf /etc/logrotate.d/dress-doctor
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# Two entrypoints, one image: `api` (default) or `worker`.
CMD ["node", "dist/main"]
