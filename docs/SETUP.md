# Musikquiz Setup and Deployment Guide

## Local Development Setup

### Prerequisites
- Node.js (version specified in package.json)
- npm or yarn
- Git

### Initial Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/herr-gurka/musikquiz.git
   cd musikquiz
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create local configuration:
   - Copy `app/config/config.local.ts.example` to `app/config/config.local.ts`
   - Add your API keys and configuration:
     ```typescript
     export const localConfig = {
       spotify: {
         clientId: 'your-spotify-client-id',
         clientSecret: 'your-spotify-client-secret',
       },
       discogs: {
         apiKey: 'your-discogs-api-key',
       },
     };
     ```

4. Start the development server:
   ```bash
   npm run dev
   ```

### Local Development Notes
- The application uses `config.local.ts` for all API keys and configuration in development
- This file is git-ignored and should never be committed
- You can test with both Spotify and Discogs by adding both API keys to the local config

## Production Deployment

### Environment Variables
The following environment variables need to be set in Vercel:

1. Spotify API:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`

2. Discogs API:
   - `DISCOGS_API_KEY`

### Deployment Process
1. Push changes to the main branch
2. Vercel automatically detects changes and starts a new deployment
3. The application uses environment variables from Vercel in production

### Deployment Notes
- Production environment uses `config.prod.ts` which reads from environment variables
- Never commit sensitive information to the repository
- Always test changes locally before deploying to production

## Project Structure
```
musikquiz/
├── app/
│   ├── config/
│   │   ├── config.local.ts     # Local development config (git-ignored)
│   │   ├── config.prod.ts      # Production config using env vars
│   │   ├── config.ts           # Main config file
│   │   └── playlists.ts        # Playlist configurations
│   ├── api/                    # API routes
│   └── ...                     # Other app files
├── docs/                       # Documentation
└── ...                         # Other project files
```

## Security Notes
- Never commit API keys or sensitive information
- Keep `config.local.ts` secure and local to your machine
- Use environment variables in production
- Regularly rotate API keys and secrets

## Troubleshooting
1. If local development isn't working:
   - Check that `config.local.ts` exists and has valid API keys
   - Ensure all required environment variables are set

2. If production deployment fails:
   - Verify all environment variables are set in Vercel
   - Check deployment logs for specific errors
   - Ensure all required API keys are valid 