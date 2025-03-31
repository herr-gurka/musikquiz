import { NextResponse, NextRequest } from 'next/server';
import { getSpotifyAccessToken } from '@/app/utils/spotify';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const startIndex = parseInt(searchParams.get('startIndex') || '0');
    const limit = parseInt(searchParams.get('limit') || '5');

    if (!url) {
      return NextResponse.json({ error: 'Playlist URL is required' }, { status: 400 });
    }

    // Extract playlist ID from URL
    const playlistId = url.split('playlist/')[1]?.split('?')[0];
    if (!playlistId) {
      return NextResponse.json({ error: 'Invalid playlist URL' }, { status: 400 });
    }

    // Get playlist tracks from Spotify
    const playlistResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&offset=${startIndex}`, {
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`,
      },
    });

    if (!playlistResponse.ok) {
      const error = await playlistResponse.json();
      return NextResponse.json({ error: error.error?.message || 'Failed to fetch playlist' }, { status: playlistResponse.status });
    }

    const playlistData = await playlistResponse.json();
    const tracks = playlistData.items.map((item: any) => item.track);

    if (!tracks.length) {
      return NextResponse.json({ songs: [], total: 0, hasMore: false });
    }

    // Process only the first 2 tracks initially to avoid timeout
    const initialTracks = tracks.slice(0, 2);
    const transformedSongs = [];
    const totalTracks = playlistData.total;

    for (const track of initialTracks) {
      try {
        // Add a delay before each Discogs request to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log(`\nProcessing song: ${track.name} by ${track.artists[0].name}`);
        console.log('Current release date from Spotify:', track.album.release_date);
        
        // Use the new Discogs API endpoint
        const discogsUrl = new URL('/api/discogs', request.url);
        discogsUrl.searchParams.set('artist', track.artists[0].name);
        discogsUrl.searchParams.set('title', track.name);
        
        console.log('Calling Discogs API endpoint:', discogsUrl.toString());
        const discogsResponse = await fetch(discogsUrl);
        
        if (!discogsResponse.ok) {
          const errorText = await discogsResponse.text();
          console.error('Discogs API error:', {
            status: discogsResponse.status,
            statusText: discogsResponse.statusText,
            error: errorText
          });
          throw new Error('Failed to fetch from Discogs API');
        }
        
        const releaseDate = await discogsResponse.json();
        console.log('Discogs result:', releaseDate);
        
        const spotifyDate = track.album.release_date.split('-');
        console.log('Spotify date parts:', spotifyDate);
        
        const transformedSong = {
          artist: track.artists[0].name,
          title: track.name,
          releaseYear: releaseDate?.date?.year || spotifyDate[0] || 'N/A',
          releaseMonth: releaseDate?.date?.month || (spotifyDate[1] ? MONTHS[parseInt(spotifyDate[1]) - 1] : 'N/A'),
          releaseDay: releaseDate?.date?.day || spotifyDate[2] || 'N/A',
          currentReleaseDate: track.album.release_date,
          spotifyUrl: track.external_urls.spotify,
          source: releaseDate?.date ? 'discogs' : 'spotify',
          sourceUrl: releaseDate?.releaseId ? `https://www.discogs.com/release/${releaseDate.releaseId}` : track.external_urls.spotify
        };
        
        console.log('Transformed song data:', transformedSong);
        transformedSongs.push(transformedSong);
      } catch (error) {
        console.error(`Error processing track ${track.name}:`, error);
        console.error('Full error details:', error);
        
        const spotifyDate = track.album.release_date.split('-');
        const fallbackSong = {
          artist: track.artists[0].name,
          title: track.name,
          releaseYear: spotifyDate[0] || 'N/A',
          releaseMonth: spotifyDate[1] ? MONTHS[parseInt(spotifyDate[1]) - 1] : 'N/A',
          releaseDay: spotifyDate[2] || 'N/A',
          currentReleaseDate: track.album.release_date,
          spotifyUrl: track.external_urls.spotify,
          source: 'spotify',
          sourceUrl: track.external_urls.spotify
        };
        
        console.log('Falling back to Spotify data:', fallbackSong);
        transformedSongs.push(fallbackSong);
      }
    }

    // Return initial songs quickly
    return NextResponse.json({
      songs: transformedSongs,
      total: totalTracks,
      hasMore: startIndex + tracks.length < totalTracks,
      remainingTracks: tracks.slice(2) // Include remaining tracks for background processing
    });
  } catch (error) {
    console.error('Error in Spotify playlist route:', error);
    return NextResponse.json({ error: 'Failed to process playlist' }, { status: 500 });
  }
} 