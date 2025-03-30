import { NextResponse } from 'next/server';

interface SpotifyToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyTrack {
  track: {
    name: string;
    artists: { name: string }[];
    album: {
      release_date: string;
    };
  };
}

interface SpotifyPlaylistResponse {
  items: SpotifyTrack[];
  total: number;
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const playlistUrl = searchParams.get('url');

    console.log('Fetching playlist from URL:', playlistUrl);

    if (!playlistUrl) {
      console.log('Error: No playlist URL provided');
      return NextResponse.json({ error: 'Playlist URL is required' }, { status: 400 });
    }

    // Extract playlist ID from URL
    const playlistId = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/)?.[1];
    if (!playlistId) {
      console.log('Error: Invalid playlist URL format');
      return NextResponse.json({ error: 'Invalid playlist URL' }, { status: 400 });
    }

    console.log('Extracted playlist ID:', playlistId);

    const token = await getAccessToken();
    console.log('Got Spotify access token');

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.log('Error: Spotify API returned status:', response.status);
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data: SpotifyPlaylistResponse = await response.json();
    console.log(`Fetched ${data.items.length} tracks from playlist`);

    // Transform the data into our song format
    const songs = data.items.map(item => ({
      title: item.track.name,
      artist: item.track.artists[0].name,
      releaseYear: item.track.album.release_date.split('-')[0],
    }));

    console.log('Transformed songs:', songs);
    return NextResponse.json(songs);
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlist' },
      { status: 500 }
    );
  }
} 