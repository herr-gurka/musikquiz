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

// Helper function to calculate match score between a Discogs result and our search terms
async function calculateMatchScore(result: any, cleanedArtist: string, cleanedTitle: string, headers: any): Promise<{ score: number; trackNumber?: number }> {
  // First check if the artist matches
  const resultTitle = result.title.toLowerCase();
  let artistScore = 0;

  // Handle various artist formats like "Artist (2)" or "Artist, The"
  const artistPart = resultTitle.split(' - ')[0]
    .replace(/\(\d+\)/g, '') // Remove numbers in parentheses
    .replace(/,\s*the$/i, '') // Remove ", The" at the end
    .trim();

  if (artistPart === cleanedArtist) {
    artistScore = 40; // Exact artist match
  } else if (artistPart.includes(cleanedArtist) || cleanedArtist.includes(artistPart)) {
    artistScore = 20; // Partial artist match
  }

  if (artistScore === 0) {
    return { score: 0 }; // If artist doesn't match at all, don't bother checking tracks
  }

  // Get the master release details to check the tracklist
  const masterUrl = `${DISCOGS_API_URL}/masters/${result.id}`;
  console.log('\nChecking tracklist for master:', masterUrl);
  
  try {
    const masterResponse = await fetch(masterUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

    if (!masterResponse.ok) {
      console.log('Failed to fetch master details');
      return { score: 0 };
    }

    const masterData = await masterResponse.json();
    console.log('Found tracklist with', masterData.tracklist?.length || 0, 'tracks');

    // Look for our song in the tracklist
    let bestTrackScore = 0;
    let matchedTrackNumber: number | undefined = undefined;

    masterData.tracklist?.forEach((track: any, index: number) => {
      const trackTitle = track.title.toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      console.log('Comparing track:', trackTitle, 'with:', cleanedTitle);

      let trackScore = 0;
      if (trackTitle === cleanedTitle) {
        trackScore = 40; // Exact title match
        matchedTrackNumber = index + 1;
      } else if (trackTitle.includes(cleanedTitle) || cleanedTitle.includes(trackTitle)) {
        trackScore = 20; // Partial title match
        if (!matchedTrackNumber) matchedTrackNumber = index + 1;
      }

      if (trackScore > bestTrackScore) {
        bestTrackScore = trackScore;
      }
    });

    // Year validation (20 points max)
    let yearScore = 0;
    const year = parseInt(result.year, 10);
    if (!isNaN(year) && year >= 1900 && year <= new Date().getFullYear()) {
      yearScore = 20;
    }

    const totalScore = artistScore + bestTrackScore + yearScore;

    console.log('Match score calculation:', {
      album: result.title,
      year: result.year,
      artistScore,
      bestTrackScore,
      yearScore,
      totalScore,
      matchedTrackNumber
    });

    return { score: totalScore, trackNumber: matchedTrackNumber };
  } catch (error) {
    console.error('Error checking master release:', error);
    return { score: 0 };
  }
}

// Helper function to return Spotify data
function fallbackToSpotify(song: { artist: string; title: string; currentReleaseDate: string; spotifyUrl: string }) {
  return {
    ...song,
    releaseYear: song.currentReleaseDate.split('-')[0] || 'N/A',
    releaseMonth: getMonthName(song.currentReleaseDate.split('-')[1]),
    releaseDay: song.currentReleaseDate.split('-')[2] || 'N/A',
    source: 'spotify',
    sourceUrl: song.spotifyUrl
  };
}

// Helper function to parse release date
function parseReleaseDate(released: string) {
  const releaseDate = {
    year: 'N/A',
    month: 'N/A',
    day: 'N/A'
  };

  if (released) {
    const parts = released.split('-');
    if (parts[0]) releaseDate.year = parts[0];
    if (parts[1]) {
      const monthNum = parseInt(parts[1], 10);
      if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        releaseDate.month = getMonthName(parts[1]);
      }
    }
    if (parts[2]) {
      const dayNum = parseInt(parts[2], 10);
      if (!isNaN(dayNum)) {
        releaseDate.day = dayNum.toString();
      }
    }
  }

  return releaseDate;
}

async function getDiscogsData(song: { artist: string; title: string; currentReleaseDate: string; spotifyUrl: string }) {
  try {
    const headers = {
      'User-Agent': 'MusikQuiz/1.0.0',
      'Authorization': `Discogs token=${config.discogs.apiKey}`
    };

    // Clean the title and artist for better matching
    const cleanedTitle = song.title.toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const cleanedArtist = song.artist.toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`\nSearching Discogs for: ${cleanedArtist} - ${cleanedTitle}`);

    // Search with both artist and title
    const searchQuery = `${cleanedArtist} ${cleanedTitle}`;
    const searchUrl = `${DISCOGS_API_URL}/database/search?q=${encodeURIComponent(searchQuery)}&type=master&per_page=20`;
    
    console.log('Making Discogs API request:', searchUrl);
    const searchResponse = await fetch(searchUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

    if (!searchResponse.ok) {
      const error = await searchResponse.text();
      console.error('Discogs API error:', {
        status: searchResponse.status,
        statusText: searchResponse.statusText,
        error
      });
      throw new Error('Failed to search Discogs');
    }

    const searchData = await searchResponse.json();
    console.log('Search results:', {
      query: searchQuery,
      resultsCount: searchData.results?.length || 0,
      results: searchData.results?.map((r: any) => ({
        title: r.title,
        year: r.year,
        id: r.id
      }))
    });

    if (!searchData.results?.length) {
      console.log('No Discogs results found, using Spotify data');
      return fallbackToSpotify(song);
    }

    // Find the best matching release
    let bestMatch = null;
    let bestMatchScore = -1;
    let bestMatchTrackNumber: number | undefined = undefined;
    let bestMatchYear = Infinity;

    for (const result of searchData.results) {
      // Quick artist match check before making API calls
      const resultTitle = result.title.toLowerCase();
      const artistPart = resultTitle.split(' - ')[0]
        .replace(/\(\d+\)/g, '')
        .replace(/,\s*the$/i, '')
        .trim();

      if (artistPart !== cleanedArtist && !artistPart.includes(cleanedArtist) && !cleanedArtist.includes(artistPart)) {
        continue;
      }

      // Skip live albums and compilations
      if (resultTitle.includes('live') || resultTitle.includes('concert') || 
          resultTitle.includes('compilation') || resultTitle.includes('greatest hits')) {
        continue;
      }

      // Get the master release details to check the tracklist
      const masterUrl = `${DISCOGS_API_URL}/masters/${result.id}`;
      console.log('Fetching master details:', masterUrl);
      const masterResponse = await fetch(masterUrl, { headers });
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

      if (!masterResponse.ok) {
        continue;
      }

      const masterData = await masterResponse.json();

      // Skip if it's a live album or compilation
      if (masterData.genres?.some((genre: string) => 
        ['live', 'compilation', 'greatest hits'].includes(genre.toLowerCase())
      )) {
        continue;
      }

      // Look for our song in the tracklist
      let bestTrackScore = 0;
      let matchedTrackNumber: number | undefined = undefined;

      masterData.tracklist?.forEach((track: any, index: number) => {
        const trackTitle = track.title.toLowerCase()
          .replace(/\([^)]*\)/g, '')
          .replace(/\[[^\]]*\]/g, '')
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        let trackScore = 0;
        if (trackTitle === cleanedTitle) {
          trackScore = 40; // Exact title match
          matchedTrackNumber = index + 1;
        } else if (trackTitle.includes(cleanedTitle) || cleanedTitle.includes(trackTitle)) {
          trackScore = 20; // Partial title match
          if (!matchedTrackNumber) matchedTrackNumber = index + 1;
        }

        if (trackScore > bestTrackScore) {
          bestTrackScore = trackScore;
        }
      });

      // Year validation (20 points max)
      let yearScore = 0;
      const year = parseInt(result.year, 10);
      if (!isNaN(year) && year >= 1900 && year <= new Date().getFullYear()) {
        yearScore = 20;
      }

      // Calculate base score for artist and track matching
      const baseScore = (artistPart === cleanedArtist ? 40 : 20) + bestTrackScore;

      // Only consider format if years are the same
      let formatScore = 0;
      if (year === bestMatchYear) {
        if (masterData.formats?.some((format: any) => 
          format.descriptions?.some((desc: string) => 
            ['album', 'studio', 'full length'].some(keyword => 
              desc.toLowerCase().includes(keyword)
            )
          )
        )) {
          formatScore = 10;
        }
      }

      // First compare by year, then by score
      if (year < bestMatchYear || (year === bestMatchYear && baseScore + formatScore > bestMatchScore)) {
        bestMatchScore = baseScore + formatScore;
        bestMatch = result;
        bestMatchTrackNumber = matchedTrackNumber;
        bestMatchYear = year;
      }

      // Stop if we find a perfect match (100 points) or very good match (90+ points)
      if (baseScore + formatScore >= 90) {
        break;
      }
    }

    if (!bestMatch || bestMatchScore < 60) {
      console.log('No good match found, using Spotify data');
      return fallbackToSpotify(song);
    }

    console.log('Best match found:', {
      title: bestMatch.title,
      year: bestMatch.year,
      score: bestMatchScore,
      trackNumber: bestMatchTrackNumber
    });

    // Get the master release details to get the main release ID
    const masterUrl = `${DISCOGS_API_URL}/masters/${bestMatch.id}`;
    console.log('Fetching master details for main release:', masterUrl);
    const masterResponse = await fetch(masterUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

    if (!masterResponse.ok) {
      console.log('Failed to fetch master details for main release, using Spotify data');
      return fallbackToSpotify(song);
    }

    const masterData = await masterResponse.json();
    const mainReleaseId = masterData.main_release;

    if (!mainReleaseId) {
      console.log('No main release ID found, using Spotify data');
      return fallbackToSpotify(song);
    }

    // Get the main release details
    const mainReleaseUrl = `${DISCOGS_API_URL}/releases/${mainReleaseId}`;
    console.log('Fetching main release details:', mainReleaseUrl);
    const mainReleaseResponse = await fetch(mainReleaseUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

    if (!mainReleaseResponse.ok) {
      console.log('Failed to fetch main release details, using Spotify data');
      return fallbackToSpotify(song);
    }

    const mainReleaseData = await mainReleaseResponse.json();
    console.log('Main release details:', {
      title: mainReleaseData.title,
      released: mainReleaseData.released,
      formats: mainReleaseData.formats
    });

    // Skip promos, samplers, and re-releases
    const format = mainReleaseData.formats?.[0];
    if (format?.descriptions?.some((desc: string) => 
      ['promo', 'sampler', 'test pressing', 'advance', 'acetate', 'reissue', 'remaster'].some(keyword => 
        desc.toLowerCase().includes(keyword)
      )
    )) {
      console.log('Skipping promo/sampler/reissue release, using Spotify data');
      return fallbackToSpotify(song);
    }

    const releaseDate = parseReleaseDate(mainReleaseData.released);

    // Only validate that the year is within a reasonable range
    const year = parseInt(releaseDate.year, 10);
    if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) {
      console.log('Invalid release year, using Spotify data');
      return fallbackToSpotify(song);
    }

    const result = {
      ...song,
      releaseYear: releaseDate.year,
      releaseMonth: releaseDate.month,
      releaseDay: releaseDate.day,
      source: 'discogs',
      sourceUrl: `https://www.discogs.com/master/${bestMatch.id}${bestMatchTrackNumber ? '#' + bestMatchTrackNumber : ''}`
    };

    console.log('Final result:', result);
    return result;

  } catch (error) {
    console.error(`Error processing song ${song.title}:`, error);
    return fallbackToSpotify(song);
  }
}

function getMonthName(monthNum: string | undefined): string {
  if (!monthNum) return 'N/A';
  const num = parseInt(monthNum, 10);
  if (isNaN(num) || num < 1 || num > 12) return 'N/A';
  return MONTHS[num - 1];
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const startIndex = parseInt(searchParams.get('startIndex') || '0');
    const limit = parseInt(searchParams.get('limit') || '5');

    console.log('Spotify playlist request:', { url, startIndex, limit });

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

    console.log('Fetching playlist with ID:', playlistId);

    // Get playlist tracks from Spotify
    const playlistResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&offset=${startIndex}`, {
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`,
      },
    });

    if (!playlistResponse.ok) {
      const error = await playlistResponse.json();
      console.error('Spotify API error:', error);
      return NextResponse.json({ error: error.error?.message || 'Failed to fetch playlist' }, { status: playlistResponse.status });
    }

    const playlistData = await playlistResponse.json();
    console.log('Received playlist data:', {
      totalTracks: playlistData.total,
      receivedTracks: playlistData.items.length
    });

    const tracks = playlistData.items.map((item: any) => item.track);

    if (!tracks.length) {
      console.log('No tracks found in playlist');
      return NextResponse.json({ songs: [], total: 0, hasMore: false });
    }

    // Process songs in batches of 3
    const batchSize = 3;
    const processedSongs = [];
    
    for (let i = 0; i < tracks.length; i += batchSize) {
      const batch = tracks.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(tracks.length/batchSize)}`);
      console.log('Batch songs:', batch.map((s: SpotifyTrack) => s.name).join(', '));

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map((track: SpotifyTrack) => getDiscogsData({
          artist: track.artists[0].name,
          title: track.name,
          currentReleaseDate: track.album.release_date,
          spotifyUrl: track.external_urls.spotify
        }))
      );

      processedSongs.push(...batchResults);

      // Add a small delay between batches to respect rate limits
      if (i + batchSize < tracks.length) {
        console.log('Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return NextResponse.json({
      songs: processedSongs,
      total: playlistData.total,
      hasMore: startIndex + tracks.length < playlistData.total
    });
  } catch (error) {
    console.error('Error processing playlist:', error);
    return NextResponse.json({ error: 'Failed to process playlist' }, { status: 500 });
  }
} 