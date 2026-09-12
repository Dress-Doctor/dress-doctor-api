import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_DIR: Joi.string().optional(),

  // Database
  DATABASE_URL: Joi.string().uri().required(),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().required(),
  REDIS_NAME: Joi.string().required(),
  // Logical database index. Real environments stay on 0; the e2e suites move
  // to their own db so test keys can never sit beside dev/stage data.
  REDIS_DB: Joi.number().min(0).max(15).default(0),

  // How long the who-did-what trail is kept, in days. Read when the Activity
  // schema builds its TTL index, so changing it only affects a collection
  // that does not exist yet — moving an existing horizon needs a collMod
  // migration on expireAfterSeconds.
  ACTIVITY_RETENTION_DAYS: Joi.number().min(1).default(730),

  // Auth
  JWT_SECRET: Joi.string().min(16).required(),
  // Access token stays short-lived (stolen access tokens aren't revocable);
  // longevity comes from the rotated 30-day refresh token. Any `ms`/jwt
  // duration string, e.g. '15m', '1h'.
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().positive().default(30),
  SALT: Joi.string().required(),
  ADMIN_PASSWORD: Joi.string().required(),

  // Office links
  DD_API_URL: Joi.string().uri().required(),
  DD_WEB_URL: Joi.string().uri().required(),
  DD_OFFICE_LINK_SECRET: Joi.string().required(),
  // How long a signed office link stays valid (days). Printed on QR codes, so
  // long by default; the expiry is inside the HMAC payload.
  OFFICE_LINK_TTL_DAYS: Joi.number().positive().default(365),
  // Attribution cookie domain (e.g. .dressdoctor.io). Empty → request host.
  COOKIE_DOMAIN: Joi.string().allow('').optional(),

  // Mail
  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().port().required(),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  MAIL_FROM: Joi.string().required(),

  // WhatsApp Business Cloud API (optional in dev — provider falls back to console)
  WHATSAPP_API_URL: Joi.string().uri().optional(),
  WHATSAPP_TOKEN: Joi.string().optional(),
  WHATSAPP_PHONE_NUMBER: Joi.string().optional(),
  // Inbound status-webhook: HMAC app secret + verification handshake token.
  WHATSAPP_APP_SECRET: Joi.string().optional(),
  WHATSAPP_VERIFY_TOKEN: Joi.string().optional(),
  // Customer Service destination for inactivity alerts (E.164). Optional in
  // dev — the scan logs + counts skipped alerts when unset.
  CS_WHATSAPP_PHONE: Joi.string().optional(),
}).unknown(true);
