import { RequestMethod, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { HTTPExceptionFilter } from 'src/helper/exception-filters/http.exception-filter';
import { HTTPResponseInterceptor } from 'src/helper/interceptor/http.interceptor';
import { AppValidationPipe } from 'src/helper/pipe/app-validation.pipe';

/**
 * Everything that must be true of the app in every environment: cookie
 * parsing, the route prefix and versioning, and the response/error envelope.
 *
 * It lives here rather than inline in `main.ts` because e2e specs boot the app
 * themselves — when the two bootstraps drift, tests pass against a shape
 * production never serves.
 */
export function configureApp(app: INestApplication): INestApplication {
  // Auth cookies are HttpOnly; the guard needs them parsed off the request.
  app.use(cookieParser());

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'o/*path', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalFilters(new HTTPExceptionFilter());
  app.useGlobalInterceptors(new HTTPResponseInterceptor());
  app.useGlobalPipes(AppValidationPipe);

  return app;
}

/**
 * Browser clients send the session cookie, so the origin allowlist is the
 * boundary that stops another site from riding along with it. Never widen this
 * to a wildcard — `credentials: true` and `origin: '*'` are mutually exclusive
 * for good reason.
 */
export function corsOptions() {
  return {
    credentials: true,
    methods: 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS',
    origin: (
      process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:4173'
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
