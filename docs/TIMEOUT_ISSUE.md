# Vercel Timeout Issue and Solution Proposal

## Current Issue

The application is experiencing 504 Gateway Timeout errors in production (Vercel) when trying to fetch song information. This occurs because:

1. Each song requires multiple Discogs API calls:
   - Initial search query
   - Master release details fetch
   - Main release details fetch
2. Rate limiting requires 1-second delay between Discogs API calls
3. Vercel has a 10-second timeout limit for serverless functions
4. Processing even a single song can take 3-4 seconds due to these constraints

## Project Structure and Dependencies

### Key Files and Their Roles

1. `app/quiz/page.tsx`
   - Main quiz interface
   - Handles playlist URL input
   - Manages quiz state and song loading
   - Makes requests to `/api/spotify-playlist`

2. `app/api/spotify-playlist/route.ts`
   - Processes playlist URL
   - Fetches songs from Spotify
   - Currently also handles Discogs API calls
   - Returns song data with release dates

3. `app/config/config.ts`
   - Central configuration
   - API keys and settings
   - Environment-specific settings

4. `app/utils/spotify.ts`
   - Spotify API utilities
   - Token management
   - Authentication

### Data Flow

1. User enters playlist URL
2. Frontend (`page.tsx`) calls `/api/spotify-playlist` with:
   - Playlist URL
   - Start index
   - Limit
3. Backend:
   - Fetches playlist from Spotify
   - For each song:
     - Searches Discogs
     - Gets release details
     - Returns complete song data
4. Frontend displays quiz cards

## Proposed Solution: Split Processing

### Overview

Split the song processing into two phases:
1. Quick initial response with Spotify data
2. Background processing for Discogs release dates

### Implementation Plan

1. **New API Endpoint**: `/api/process-songs`
   - Accepts batch of songs
   - Processes Discogs data
   - Returns updated song information

2. **Modified Spotify Playlist Endpoint**
   - Return Spotify data immediately
   - Include temporary release dates from Spotify
   - Return total song count for pagination

3. **Updated Frontend**
   - Display songs immediately with Spotify dates
   - Make background requests to process songs
   - Update UI when accurate dates arrive

### Detailed Changes Required

1. `app/api/spotify-playlist/route.ts`:
   ```typescript
   // Simplified to only handle Spotify data
   // Returns: { songs: SpotifySong[], total: number, hasMore: boolean }
   ```

2. New `app/api/process-songs/route.ts`:
   ```typescript
   // Handles Discogs processing
   // Input: Array of songs with Spotify data
   // Returns: Array of songs with accurate release dates
   ```

3. `app/quiz/page.tsx`:
   ```typescript
   // Add state for processed songs
   // Add background processing logic
   // Update UI when songs are processed
   ```

### Benefits

1. **Immediate Response**:
   - Users see quiz interface quickly
   - No timeout errors
   - Better perceived performance

2. **Reliable Processing**:
   - Each song processed independently
   - Failures don't affect other songs
   - Respects rate limits

3. **Better UX**:
   - Progressive loading
   - Visual feedback
   - No long initial wait

### Considerations

1. **State Management**:
   - Track processed vs unprocessed songs
   - Handle failed processing
   - Update UI smoothly

2. **Error Handling**:
   - Retry failed Discogs requests
   - Fallback to Spotify dates
   - Clear error messages

3. **Rate Limiting**:
   - Maintain 1 request/second to Discogs
   - Process songs in batches
   - Track API usage

## Implementation Steps

1. Create new API endpoint
2. Modify existing endpoint
3. Update frontend logic
4. Add error handling
5. Implement progress indicators
6. Test with various playlist sizes

## Future Improvements

1. **Caching**:
   - Cache Discogs results
   - Reduce API calls
   - Faster repeat lookups

2. **Batch Processing**:
   - Process multiple songs per request
   - Optimize API usage
   - Better scaling

3. **Progress Tracking**:
   - Show processing status
   - Estimated completion time
   - Detailed error reporting 