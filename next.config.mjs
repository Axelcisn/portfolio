/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false, // Disable StrictMode to prevent double rendering in development
};
export default nextConfig;
