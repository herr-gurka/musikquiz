module.exports = {
  apps: [{
    name: 'musikquiz',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    env: {
      PORT: 3001,
      NODE_ENV: 'production',
      SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
      SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET
    }
  }]
} 