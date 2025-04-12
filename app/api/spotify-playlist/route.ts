import { NextResponse, NextRequest } from 'next/server';
import { getSpotifyAccessToken } from '@/app/utils/spotify';
import { config } from '@/app/config/config';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DISCOGS_API_URL = 'https://api.discogs.com';

interface SpotifyToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyTrack {
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    release_date: string;
  };
  external_urls: {
    spotify: string;
  };
}

interface SpotifyPlaylistResponse {
  items: Array<{
    track: SpotifyTrack;
  }>;
}

let tokenData: SpotifyToken | null = null;
let tokenExpiration: number = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenData && now < tokenExpiration) {
    return tokenData.access_token;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error('Failed to get Spotify token');
  }

  const data = await response.json();
  if (!data || typeof data.expires_in !== 'number' || typeof data.access_token !== 'string') {
    throw new Error('Invalid token response from Spotify');
  }
  
  tokenData = data;
  tokenExpiration = now + (data.expires_in * 1000);
  return data.access_token;
}

function getMonthName(monthNum: string | undefined): string {
  if (!monthNum) return 'N/A';
  const num = parseInt(monthNum, 10);
  if (isNaN(num) || num < 1 || num > 12) return 'N/A';
  return MONTHS[num - 1];
}

// Fisher-Yates (aka Knuth) Shuffle algorithm
function shuffleArray(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // Swap elements
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    // startIndex is no longer needed for sampling logic, remove?
    // const startIndex = parseInt(searchParams.get('startIndex') || '0'); 
    const maxQuizSize = 200; // Max songs for the quiz

    console.log('Spotify playlist request:', { url });

    if (!url) {
      console.error('No URL provided');
      return NextResponse.json({ error: 'Playlist URL is required' }, { status: 400 });
    }

    // Extract playlist ID from URL
    const playlistId = url.split('playlist/')[1]?.split('?')[0];
    if (!playlistId) {
      console.error('Invalid playlist URL:', url);
      return NextResponse.json({ error: 'Invalid playlist URL' }, { status: 400 });
    }

    console.log('Fetching playlist metadata for ID:', playlistId);

    // --- Step 1: Fetch playlist metadata (total tracks) ---
    const metaResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=tracks.total`, {
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`,
      },
    });
    if (!metaResponse.ok) {
        const error = await metaResponse.json();
        console.error('Spotify API error fetching metadata:', error);
        return NextResponse.json({ error: error.error?.message || 'Failed to fetch playlist metadata' }, { status: metaResponse.status });
    }
    const metaData = await metaResponse.json();
    const totalTracks = metaData.tracks?.total || 0;
    if (totalTracks === 0) {
        console.log('Playlist is empty.');
        return NextResponse.json({ songs: [], total: 0, hasMore: false }); // Should match expected frontend structure
    }
    console.log('Playlist total tracks:', totalTracks);

    // --- Step 2: Determine sample size and fetch tracks ---
    const numSongsToSample = Math.min(totalTracks, maxQuizSize);
    const spotifyApiLimit = 50; // Spotify API limit per request
    let fetchedTracks: SpotifyTrack[] = [];
    let offset = 0;

    console.log(`Fetching ${numSongsToSample} tracks for sampling...`);
    while (fetchedTracks.length < numSongsToSample) {
        const limit = Math.min(spotifyApiLimit, numSongsToSample - fetchedTracks.length);
        console.log(`Fetching batch: offset=${offset}, limit=${limit}`);
        const batchResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}&fields=items(track(name,artists(name),album(name,release_date),external_urls(spotify)))`, {
            headers: {
                'Authorization': `Bearer ${await getAccessToken()}`,
            },
        });

        if (!batchResponse.ok) {
            const error = await batchResponse.json();
            console.error('Spotify API error fetching tracks batch:', error);
            // Decide if we should fail or proceed with fetched tracks so far
            if (fetchedTracks.length > 0) {
                console.warn('Proceeding with partially fetched tracks.');
                break; // Exit loop if a batch fails but we have some tracks
            } else {
                return NextResponse.json({ error: error.error?.message || 'Failed to fetch playlist tracks' }, { status: batchResponse.status });
            }
        }

        const batchData = await batchResponse.json();
        const tracksInBatch = batchData.items?.map((item: any) => item.track).filter(Boolean) || [];
        fetchedTracks.push(...tracksInBatch);
        offset += limit;
        if (batchData.items?.length < limit) break; // Stop if Spotify returned fewer items than requested
    }
    console.log(`Fetched ${fetchedTracks.length} tracks total.`);

    // --- Step 3: Shuffle and Sample ---
    shuffleArray(fetchedTracks);
    const sampledSongs = fetchedTracks.slice(0, numSongsToSample); // Take the top N after shuffle
    console.log(`Sampled ${sampledSongs.length} tracks randomly.`);

    // --- Step 4: Map to Basic Structure ---
    const potentialQuizSongs = sampledSongs
      .map((track: SpotifyTrack | null) => { // fetchedTracks might contain nulls if API returns partial data
        if (!track) return null;
        if (!track.name || !track.artists || !track.artists[0]?.name || !track.album?.release_date || !track.external_urls?.spotify) {
            console.warn('Skipping sampled track due to missing data:', track);
            return null;
        }
        return {
          artist: track.artists[0].name,
          title: track.name,
          currentReleaseDate: track.album.release_date, // Send Spotify's date as baseline
          spotifyUrl: track.external_urls.spotify
        };
      })
      .filter((song): song is { artist: string; title: string; currentReleaseDate: string; spotifyUrl: string } => song !== null); // Filter out nulls and type guard

    if (!potentialQuizSongs.length) {
      console.log('No processable tracks found after filtering sampled songs.');
      return NextResponse.json({ songs: [], total: totalTracks, hasMore: false }); // Indicate no usable songs
    }

    // --- Step 5: Select Random First Song ---
    const randomIndex = Math.floor(Math.random() * potentialQuizSongs.length);
    const firstSongToProcess = potentialQuizSongs[randomIndex];
    const remainingSongsToProcess = potentialQuizSongs.filter((_, index) => index !== randomIndex);
    console.log(`Selected random first song: "${firstSongToProcess.title}"`);

    // --- Step 6: Delegate to /api/process-songs ---
    console.log(`Sending 1 first song + ${remainingSongsToProcess.length} remaining songs to /api/process-songs...`);
    const processSongsUrl = `${request.nextUrl.origin}/api/process-songs`;
    console.log('Calling process URL:', processSongsUrl);

    const processResponse = await fetch(processSongsUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            firstSong: firstSongToProcess, 
            remainingSongs: remainingSongsToProcess 
        }), // Send structured payload
    });

    if (!processResponse.ok) {
        const errorText = await processResponse.text();
        console.error(`Error calling /api/process-songs: ${processResponse.status} ${processResponse.statusText}`, errorText);
        throw new Error('Failed to process songs via API route');
    }

    // The response from /api/process-songs should now be { processedSong: ..., jobId: ... }
    const processResult = await processResponse.json(); 
    console.log(`Received response from /api/process-songs:`, processResult);

    // --- Step 7: Return Response to Frontend ---
    // Return structure needs to align with frontend expectations (might need adjustment)
    // Assuming frontend now expects { firstSong: ..., jobId: ..., total: ... }
    return NextResponse.json({
      firstSong: processResult.processedSong, // Pass the processed first song
      jobId: processResult.jobId, // Pass the job ID for background polling/SSE
      totalProcessed: 1, // Initially, only 1 song is processed
      totalAvailableInQuiz: potentialQuizSongs.length, // How many songs will be in the quiz eventually
      totalInPlaylist: totalTracks // Original playlist size
      // hasMore is no longer relevant in this model, maybe remove or adapt
    });

  } catch (error) {
    console.error('Error processing playlist:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process playlist';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 