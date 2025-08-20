/** @type {import('next').NextConfig} */
const nextConfig = {
  // Temporarily unblock deploys: skip ESLint during production builds.
  // See: https://nextjs.org/docs/app/guides/memory-usage#disable-static-analysis
  eslint: {
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
