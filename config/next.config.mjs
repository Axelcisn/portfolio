import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables from the local env file
loadEnv({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env.local') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
