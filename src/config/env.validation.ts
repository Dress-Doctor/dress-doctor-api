import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  // Database
  DATABASE_URL: Joi.string().uri().required(),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().required(),
  REDIS_NAME: Joi.string().required(),

  // Auth
  JWT_SECRET: Joi.string().min(16).required(),
  SALT: Joi.string().required(),
  ADMIN_PASSWORD: Joi.string().required(),

  // Office links
  DD_API_URL: Joi.string().uri().required(),
  DD_WEB_URL: Joi.string().uri().required(),
  DD_OFFICE_LINK_SECRET: Joi.string().required(),

  // Mail
  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().port().required(),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  MAIL_FROM: Joi.string().required(),

  // WhatsApp (send path not implemented yet — optional placeholders)
  WHATSAPP_API_URL: Joi.string().uri().optional(),
  WHATSAPP_TOKEN: Joi.string().optional(),
  WHATSAPP_PHONE_NUMBER: Joi.string().optional(),

  // Google Sheets migration (Phase 1 script) — optional
  GOOGLE_APPLICATION_CREDENTIALS: Joi.string().optional(),
  SEED_ITEMS: Joi.string().valid('YES', 'NO').default('NO'),

  // Platform client credentials used by external callers, not read server-side
  API_KEY: Joi.string().optional(),
  API_SECRET: Joi.string().optional(),
}).unknown(true);
