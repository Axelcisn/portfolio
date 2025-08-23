/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false, // Disable StrictMode to prevent double rendering in development
  swcMinify: true,
  typescript: {
    ignoreBuildErrors: true, // Skip TypeScript errors during build
  },
  // Ensure dynamic pages are handled correctly
  generateBuildId: async () => {
    // Return a consistent build ID
    return 'build-' + Date.now();
  },
};
export default nextConfig;
