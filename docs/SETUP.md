# Musikquiz Setup and Deployment Guide

> **IMPORTANT**: This documentation file should be kept local and never committed to git as it may contain sensitive information. It is for development reference only.

## Project Overview
Musikquiz is a web application that creates music quizzes from Spotify playlists. It:
- Fetches songs from Spotify playlists
- Retrieves original release dates from Discogs API
- Presents songs one at a time with a card-based interface
- Allows users to guess release dates
- Shows progress and completed songs

## Local Development Setup

### Prerequisites
- Node.js (version specified in package.json)
- npm or yarn
- Git
- Spotify Developer Account
- Discogs Developer Account

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
- The application will automatically use:
  - Local config file in development
  - Environment variables in production

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
4. The deployment URL will be: `https://musikquiz-three.vercel.app`

### Deployment Settings
- Framework Preset: Next.js
- Build Command: `next build`
- Output Directory: `.next`
- Install Command: `npm install`

### Common Deployment Issues

1. **504 Gateway Timeout**
   - This can occur when processing large playlists
   - The application is configured to handle this by:
     - Processing only 2 songs initially
     - Loading remaining songs in the background
     - Using proper rate limiting for API calls

2. **Environment Variables**
   - If you see errors related to missing environment variables:
     - Double-check that all required variables are set in Vercel
     - Ensure variables are added to all environments
     - Redeploy after adding new variables

3. **Build Failures**
   - Check the build logs in Vercel dashboard
   - Common fixes:
     - Ensure all dependencies are in package.json
     - Check for TypeScript errors
     - Verify Next.js configuration

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
│   │   ├── discogs/           # Discogs API integration
│   │   ├── spotify-playlist/  # Spotify playlist processing
│   │   └── spotify-token/     # Spotify authentication
│   └── ...                     # Other app files
├── docs/                       # Documentation
└── ...                         # Other project files
```

## API Integration

### Spotify API
- Used for fetching playlist data and song information
- Requires Client ID and Client Secret
- Handles token refresh automatically
- Rate limiting is implemented

### Discogs API
- Used for retrieving original release dates
- Requires API key
- Implements rate limiting (1 request per second)
- Handles various release formats and dates

## Release Date Information

The application uses Discogs API to get accurate release dates for songs. Here's how we handle the search and selection process:

### Search Strategy
1. Search for the song using both artist and title: `${artist} ${title}`
2. Filter out live albums and compilations
3. For each potential match:
   - Get master release details to check tracklist
   - Look for exact or partial title matches
   - Calculate a base score based on artist and track matching

### Release Selection Logic
The key to getting correct release dates is prioritizing the year over other factors:

1. **Year Priority**:
   - Always select the earliest release year first
   - Only consider other factors (artist match, track match) when comparing releases from the same year
   - This ensures we get the original release date, not later re-releases or singles

2. **Scoring System**:
   - Base score (80 points max):
     - 40 points for exact artist match (20 for partial)
     - 40 points for exact track match (20 for partial)
   - Format bonus (10 points):
     - Only applied when comparing releases from the same year
     - Helps distinguish between albums and singles when years are equal

3. **Example**:
   For "Hook" by Blues Traveler:
   - 1994 album "Four" (correct selection)
   - 1995 single (skipped because 1994 is earlier)
   - Even if the 1995 single had a better artist/track match, we still select the 1994 album

### Important Notes
- We don't use year in the scoring system to avoid giving later releases higher scores
- We don't filter out singles/EPs in the initial search to ensure we don't miss any releases
- Format type (album vs single) is only considered when comparing releases from the same year
- The search is ordered by year ascending to find the earliest release first

## Security Notes
- Never commit API keys or sensitive information
- Keep `config.local.ts` secure and local to your machine
- Use environment variables in production
- Regularly rotate API keys and secrets

## Troubleshooting

### Local Development
1. If local development isn't working:
   - Check that `config.local.ts` exists and has valid API keys
   - Ensure all required environment variables are set
   - Check browser console for errors
   - Verify API endpoints are accessible

2. If API calls fail:
   - Verify API keys are correct
   - Check rate limiting compliance
   - Review API response logs

### Production
1. If deployment fails:
   - Check Vercel deployment logs
   - Verify environment variables
   - Review build output

2. If API calls fail in production:
   - Check Vercel logs for API errors
   - Verify environment variables are set correctly
   - Monitor rate limiting

## Getting Help
If you encounter issues:
1. Check the Vercel deployment logs
2. Review the error messages in the browser console
3. Check the API response logs
4. Contact the development team with specific error details

## Development Best Practices

### Code Changes
- Always make changes in a controlled and systematic way
- Modify one file at a time and verify changes before moving to the next
- Never attempt to change multiple files simultaneously
- Test changes locally before committing
- Keep commits focused and atomic

### API Integration
// ... existing code ... 

## Development
The application is built with:
- Next.js 14
- TypeScript
- Tailwind CSS
- Spotify Web API
- Discogs API

## Deployment
1. Build the application:
   ```bash
   npm run build
   # or
   yarn build
   ```
2. Start the production server:
   ```bash
   npm start
   # or
   yarn start
   ```

## Troubleshooting
If you encounter issues:
1. Check the environment variables are set correctly
2. Verify API keys have the correct permissions
3. Check the browser console for errors
4. Review the server logs for API errors 