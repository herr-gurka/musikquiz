interface SpotifyToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyArtist {
  name: string;
}

interface SpotifyTrack {
  id: string;
  artists: SpotifyArtist[];
  name: string;
}

interface SpotifySearchResponse {
  tracks?: {
    items: SpotifyTrack[];
  };
}

let tokenData: SpotifyToken | null = null;
let tokenExpiration: number = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenData && now < tokenExpiration) {
    return tokenData.access_token;
  }

  const response = await fetch('/api/spotify-token');
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

// Rate limiting helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function searchWithRetry(query: string, retries = 3, backoff = 1000): Promise<SpotifySearchResponse | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${query}&type=track&limit=5&market=SE`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1');
        await delay(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(backoff * Math.pow(2, i));
    }
  }
  return null;
}

export async function searchSpotifyTrack(artist: string, title: string): Promise<string | null> {
  try {
    const searchQuery = encodeURIComponent(`${title} ${artist}`);
    
    const data = await searchWithRetry(searchQuery);
    if (!data?.tracks?.items?.length) {
      return null;
    }

    // Find first track with exact artist match (case insensitive)
    const matchingTrack = data.tracks.items.find(track => {
      const artistMatch = track.artists.some(a => a.name.toLowerCase() === artist.toLowerCase());
      return artistMatch;
    });

    if (matchingTrack) {
      return matchingTrack.id;
    }

    return null;
  } catch (error) {
    console.error('Error searching Spotify:', error);
    return null;
  }
} 