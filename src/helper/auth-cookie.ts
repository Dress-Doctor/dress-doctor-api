import type { CookieOptions, Request, Response } from 'express';

/**
 * Browser clients (admin, portal) authenticate with HttpOnly cookies rather
 * than tokens held in JS, so an XSS cannot read the session. Non-browser
 * callers keep using the tokens returned in the response body — both paths are
 * accepted by `AuthGuard`.
 */
export const ACCESS_COOKIE = 'dd_at';
export const REFRESH_COOKIE = 'dd_rt';

/**
 * Both cookies are path-wide.
 *
 * Scoping the refresh cookie to `/api/v1/auth` would be tighter, but the admin
 * panel renders on the server: its document request must carry the refresh
 * cookie so an expired access token can be rotated mid-render. With a narrow
 * path the browser never sends it to the frontend origin, and every hard
 * reload after the access token expires would end in a forced re-login.
 * HttpOnly + SameSite + the origin allowlist remain the actual defences.
 */
const REFRESH_PATH = '/';

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * `sameSite: 'lax'` blocks the cross-site POSTs that CSRF relies on while
 * still allowing top-level navigation to the app. It is not the only defence:
 * every route also demands the `x-api-key`/`x-api-secret` custom headers, which
 * a cross-site form cannot set without a preflight this API's CORS refuses.
 */
const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction(),
  domain: process.env.COOKIE_DOMAIN || undefined,
});

const accessMaxAge = () => {
  const minutes = Number(process.env.JWT_ACCESS_TTL_MINUTES) || 15;
  return minutes * 60 * 1000;
};

const refreshMaxAge = () => {
  const days = Number(process.env.JWT_REFRESH_TTL_DAYS) || 30;
  return days * 24 * 60 * 60 * 1000;
};

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(),
    path: '/',
    maxAge: accessMaxAge(),
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(),
    path: REFRESH_PATH,
    maxAge: refreshMaxAge(),
  });
}

/** Same flags as when set — a cookie only clears if they match. */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: REFRESH_PATH });
}

/**
 * `req.cookies` is typed `any` by the express/cookie-parser types, so it is
 * narrowed here rather than trusted — a cookie is client input.
 */
function readCookie(req: Request, name: string): string | undefined {
  const jar = (req as { cookies?: unknown }).cookies;
  if (!jar || typeof jar !== 'object') return undefined;

  const value = (jar as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

export const readAccessCookie = (req: Request): string | undefined =>
  readCookie(req, ACCESS_COOKIE);

export const readRefreshCookie = (req: Request): string | undefined =>
  readCookie(req, REFRESH_COOKIE);
