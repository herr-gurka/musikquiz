# Musikquiz Setup and Deployment Guide

> **IMPORTANT**: This documentation file should be kept local and never committed to git as it may contain sensitive information. It is for development reference only.

## Project Overview
Musikquiz is a web application that creates music quizzes from Spotify playlists. It:
- Fetches a randomized sample of songs (up to 200) from Spotify playlists.
- Retrieves original release dates primarily using the Discogs API, falling back to Spotify data if necessary.
- Uses background processing and Server-Sent Events (SSE) via Redis (Upstash) to handle potentially long-running Discogs lookups without blocking the user interface.
- Presents songs one at a time with a card-based interface, starting with a randomly selected "Baseline Song".
- Allows users to guess release dates (future feature) or view the timeline.
- Ensures unique release years are presented in the quiz.
- Shows progress and completed songs.

## Local Development Setup

### Prerequisites
- Node.js (version specified in package.json or latest LTS)
- npm or yarn
- Git
- Vercel CLI (`npm i -g vercel`) for local development environment emulation
- Spotify Developer Account
- Discogs Developer Account
- Vercel Account with Upstash Redis integration enabled for the project

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
   
3. Install Upstash Redis Integration via Vercel:
   - Go to your project dashboard on Vercel.
   - Navigate to the Integrations tab or Marketplace.
   - Add the "Upstash Redis" integration.
   - Create a new database and link it to your project.

4. Create local configuration file `.env.local`:
   - Create a file named `.env.local` in the project root.
   - Add your API keys and Redis connection details obtained from Vercel:
     ```.env.local
     # Spotify API Credentials
     SPOTIFY_CLIENT_ID=your-spotify-client-id
     SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
     
     # Discogs API Key (Token)
     DISCOGS_API_KEY=your-discogs-api-key-or-token 
     
     # Vercel Upstash Redis Integration Credentials
     KV_REST_API_URL=your_upstash_url_from_vercel
     KV_REST_API_TOKEN=your_upstash_token_from_vercel 
     ```
   - **Important:** Ensure `.env.local` is listed in your `.gitignore` file.

5. Start the development server using Vercel CLI:
   ```bash
   vercel dev
   ```
   (Using `vercel dev` is recommended as it injects environment variables similarly to production, including the Redis variables from the integration). Alternatively, `npm run dev` might work if environment variables are loaded correctly, but `vercel dev` is preferred.

### Local Development Notes
- The application uses environment variables (loaded via `.env.local` by `vercel dev`) for all API keys and Redis configuration.
- The `.env.local` file is git-ignored and should never be committed.
- A connection to the Upstash Redis database (configured via Vercel) is required for background processing and SSE streaming to function correctly.

## Production Deployment

### Environment Variables
The following environment variables need to be set in your Vercel project settings (most should be configured automatically by integrations):

1. Spotify API:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`

2. Discogs API:
   - `DISCOGS_API_KEY` (Ensure this is set as a production variable)

3. Upstash Redis (via Vercel Integration):
   - `KV_REST_API_URL` (Managed by Vercel)
   - `KV_REST_API_TOKEN` (Managed by Vercel)

### Deployment Process
1. Push changes to the main branch.
2. Vercel automatically detects changes and starts a new deployment.
3. Ensure all necessary environment variables are configured for the production environment in Vercel project settings.
4. The deployment URL will be: `https://musikquiz-three.vercel.app` (or your custom domain).

### Deployment Settings
- Framework Preset: Next.js
- Build Command: `next build`
- Output Directory: `.next`
- Install Command: `npm install`

### Common Deployment Issues & Considerations

1. **504 Gateway Timeout / Function Execution Limits:**
   - The previous timeout issue with large playlists is now addressed by the background processing architecture.
   - The initial request to `/api/spotify-playlist` should be relatively quick as it only fetches Spotify data and processes the *first* song via Discogs synchronously.
   - The bulk of the Discogs lookups happen in a background task triggered by `/api/process-songs`, which is not directly tied to the initial HTTP request lifetime.
   - Server-Sent Events (`/api/song-stream`) are used to stream results back, keeping the connection open for a configured duration (`maxDuration`). Ensure this duration is appropriate for Vercel plan limits.

2. **Redis Connection Errors:**
   - Ensure the Upstash Redis integration is correctly linked to the Vercel project for all environments (Preview, Production).
   - Verify that the `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables are present and correct in the Vercel deployment environment. Errors like "Missing required environment variables" indicate a configuration problem.

3. **SSE Connection Issues:**
   - Check browser console for errors related to `EventSource` connection or message parsing.
   - Check backend logs for the `/api/song-stream` route for errors during Redis polling or event sending.
   - Firewall or network issues could potentially block SSE connections.

4. **Environment Variables:**
   - Double-check all required variables (Spotify, Discogs, Redis) are set in Vercel project settings for the relevant environments.
   - Redeploy after adding/modifying environment variables.

5. **Build Failures:**
   - Check Vercel build logs for specific errors (TypeScript, dependency issues, etc.).

## Project Structure
```
musikquiz/
├── app/
│   ├── config/
│   │   ├── config.local.ts.example # Example for structure, actual config via .env.local
│   │   ├── config.ts           # Main config logic (reads from process.env)
│   │   └── playlists.ts        # Predefined playlist configurations
│   ├── api/                    # API routes
│   │   ├── spotify-playlist/   # Handles fetching Spotify playlist, delegates processing
│   │   ├── process-songs/      # Processes first song, triggers background task, stores results
│   │   └── song-stream/        # Server-Sent Events endpoint for streaming results
│   ├── utils/                  # Utility functions
│   │   ├── spotify.ts          # Spotify helper functions (if any)
│   │   └── ...                 # Other utilities (e.g., string cleaning)
│   ├── quiz/                   # Components related to the quiz page
│   │   └── page.tsx            # Main quiz component (handles SSE, state)
│   ├── page.tsx                # Home page component (playlist selection form)
│   └── ...                     # Other app files (layout, globals.css)
├── docs/                       # Documentation
│   └── SETUP.md                # This file
├── .env.local                  # Local environment variables (git-ignored)
├── .gitignore                  # Git ignore configuration
├── next.config.mjs             # Next.js configuration
├── package.json                # Project dependencies and scripts
├── README.md                   # Project README
└── tsconfig.json               # TypeScript configuration
```

## Application Flow

1.  **Frontend (Home):** User selects/enters a Spotify playlist URL and navigates to `/quiz`.
2.  **Frontend (Quiz):** Makes a GET request to `/api/spotify-playlist?url=...`.
3.  **`/api/spotify-playlist`:**
    *   Fetches total track count from Spotify.
    *   Fetches up to `maxQuizSize` (e.g., 200) tracks from Spotify.
    *   Shuffles the fetched tracks.
    *   Selects one random track (`firstSong`).
    *   Makes a POST request to `/api/process-songs` with `{ firstSong, remainingSongs }`.
    *   Receives `{ processedSong, jobId }` response.
    *   Returns this response to the frontend.
4.  **`/api/process-songs`:**
    *   Receives `{ firstSong, remainingSongs }`.
    *   Processes `firstSong` synchronously using `getReleaseData` (Discogs > Spotify fallback).
    *   Generates a unique `jobId`.
    *   Starts a background task (`processRemainingSongsInBackground`) *without awaiting it*, passing `remainingSongs`, `jobId`, and the `firstSong`'s release year.
    *   Returns `{ processedSong: processedFirstSong, jobId }` immediately.
5.  **Frontend (Quiz):**
    *   Receives `{ processedSong, jobId }`.
    *   Displays the first song card.
    *   Connects to `/api/song-stream?jobId=...` using `EventSource`.
6.  **Background Task (`processRemainingSongsInBackground`):**
    *   Initializes job state in Redis (status, processed years).
    *   Loops through `remainingSongs`:
        *   Calls `getReleaseData` for each song.
        *   Checks if the resulting year is unique using Redis set (`jobId:years`).
        *   If unique and valid, pushes the stringified `ProcessedSong` object to Redis list (`jobId:results`) and updates the set of years.
    *   Sets job status to `complete` in Redis (`jobId:status`).
7.  **`/api/song-stream`:**
    *   Receives `jobId`.
    *   Periodically polls Redis for the results list (`jobId:results`) and status (`jobId:status`).
    *   Streams new songs found in the list to the connected client (`event: song`).
    *   When status is `complete` (and no new songs were sent in the last poll), sends `event: done` and closes.
8.  **Frontend (Quiz):**
    *   Receives `song` events, parses data, adds song cards dynamically.
    *   Receives `done` event, closes connection, updates UI state.


## API Integration

### Spotify API
- Used for fetching playlist metadata and track lists.
- Requires Client ID and Client Secret environment variables.
- Token management handled internally.

### Discogs API
- Used as the primary source for retrieving original release dates (year).
- Requires API Key (Personal Access Token recommended) environment variable (`DISCOGS_API_KEY`).
- Implements rate limiting (1-second delays between calls).
- Complex search/matching logic to find the best representation of the original release.
- Falls back to Spotify-provided date if Discogs lookup fails or returns invalid year.

### Upstash Redis (via Vercel Integration)
- Used as a temporary data store for background job management.
- Requires Vercel integration setup and `KV_REST_API_URL`, `KV_REST_API_TOKEN` environment variables (managed by Vercel).
- Stores:
    - Job status (`jobId:status`: processing, complete, failed).
    - Processed unique years (`jobId:years`: JSON array string).
    - Processed song results (`jobId:results`: Redis list of JSON strings).
- Data is typically set with an expiry (e.g., 1 hour) to manage storage.


## Release Date Information
- The application prioritizes finding the **original release year** for each song.
- **Discogs API** is the primary source due to its detailed catalog. The logic involves searching, scoring matches, fetching master/release details, and parsing dates.
- If Discogs fails or returns an invalid/unreliable year, the **Spotify album release date** is used as a fallback.
- The quiz ensures that only songs with **unique release years** are presented after the initial "Baseline Song".

## Security Notes
- Never commit API keys or sensitive information (use `.env.local` and Vercel environment variables).
- Ensure `.env.local` is in `.gitignore`.
- Regularly rotate API keys and secrets if possible.

## Troubleshooting
- **KV/Redis Errors:** Check Vercel integration status and environment variable configuration. Use `redis-cli` or Upstash console to inspect data if needed.
- **SSE Issues:** Use browser network tools to inspect the EventStream response from `/api/song-stream`. Check backend and frontend console logs for connection errors or message parsing issues.
- **Discogs Errors:** Check Discogs API key validity and rate limit compliance (logs should show delays).
- **Spotify Errors:** Check Spotify credentials and playlist URL validity.

## Getting Help
- Check Vercel deployment logs (Build, Runtime, Function).
- Review browser console errors.
- Review backend terminal console logs (`vercel dev` or production logs).
- Check Redis data via Upstash console if needed.
- Contact the development team with specific error details and relevant logs.

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