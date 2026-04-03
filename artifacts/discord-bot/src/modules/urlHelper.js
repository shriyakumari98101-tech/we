/**
 * Shared URL and environment helpers.
 * Single source of truth for base URL detection across all platforms.
 */

/**
 * Returns the base URL for this deployment, auto-detected from environment variables.
 * Priority: PANEL_URL > Render > Railway > Replit > fallback
 */
export function getBaseUrl() {
  if (process.env.PANEL_URL) {
    return process.env.PANEL_URL
      .replace(/\/panel\/?$/, "")
      .replace(/\/login\/?$/, "")
      .replace(/\/$/, "");
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (process.env.RAILWAY_SERVICE_DOMAIN) {
    return `https://${process.env.RAILWAY_SERVICE_DOMAIN}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "https://your-deployment.app";
}

/**
 * Returns true if the connection is served over HTTPS.
 * Includes Replit dev (which uses HTTPS) as well as Render/Railway/production.
 */
export function isSecureEnvironment() {
  return !!(
    process.env.REPLIT_DEV_DOMAIN ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_SERVICE_DOMAIN ||
    process.env.NODE_ENV === "production"
  );
}

/**
 * Returns true if we're running inside the Replit workspace preview iframe.
 * In this context cookies must use sameSite=none so they work across the iframe boundary.
 */
export function isReplitDev() {
  return !!process.env.REPLIT_DEV_DOMAIN;
}
