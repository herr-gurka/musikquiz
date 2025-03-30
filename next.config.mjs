/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  },
  images: {
    unoptimized: true,
  },
  output: 'export',
  distDir: 'dist',
  trailingSlash: true,
  basePath: process.env.NODE_ENV === 'development' ? '' : '/musikquiz',
  assetPrefix: process.env.NODE_ENV === 'development' ? '' : '/musikquiz/',
};

export default nextConfig; 