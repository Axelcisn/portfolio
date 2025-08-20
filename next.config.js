/**
 * Next.js build config
 * We temporarily disable the built-in ESLint step in production builds
 * to unblock deploys while we stabilize lint rules.
 * Ref: https://nextjs.org/docs/app/api-reference/config/next-config-js/eslint
 */
module.exports = {
  eslint: {
    // WARNING: Build will succeed even if ESLint finds errors.
    ignoreDuringBuilds: true,
  },
};
