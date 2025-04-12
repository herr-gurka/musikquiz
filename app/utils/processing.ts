import { config } from '@/app/config/config';

// --- Constants ---
const DISCOGS_API_URL = 'https://api.discogs.com';

// --- Interfaces ---
export interface ProcessedSong {
  artist: string;
  title: string;
  currentReleaseDate: string; // From Spotify initially
  spotifyUrl: string;
  releaseYear: string;
  releaseMonth: string;
  releaseDay: string;
  source: 'deezer' | 'discogs' | 'spotify';
  sourceUrl?: string;
  error?: string; // Added optional error field
}

export interface Song {
  artist: string;
  title: string;
  currentReleaseDate: string; // From Spotify initially
  spotifyUrl: string;
}

// --- Helper Functions ---

export function getMonthName(monthNum: string | undefined): string {
  if (!monthNum) return 'N/A';
  const num = parseInt(monthNum, 10);
  if (isNaN(num) || num < 1 || num > 12) return 'N/A';
  return ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][num - 1];
}

// Ensure fallbackToSpotify returns the full ProcessedSong structure
export function fallbackToSpotify(song: Song): ProcessedSong {
    return {
      artist: song.artist,
      title: song.title,
      currentReleaseDate: song.currentReleaseDate,
      spotifyUrl: song.spotifyUrl,
      releaseYear: song.currentReleaseDate.split('-')[0] || 'N/A',
      releaseMonth: getMonthName(song.currentReleaseDate.split('-')[1]),
      releaseDay: song.currentReleaseDate.split('-')[2] || 'N/A',
      source: 'spotify',
      sourceUrl: song.spotifyUrl
    };
}


export function calculateMatchScore(result: any, cleanedArtist: string, cleanedTitle: string): number {
  const resultTitle = result.title.toLowerCase();
  let score = 0;

  // Split the Discogs title which is usually in format "Artist - Title"
  const parts = resultTitle.split(' - ');
  if (parts.length !== 2) {
    return 0; // Invalid format, probably not a match
  }

  const [artistPart, titlePart] = parts;

  // Artist matching (40 points max)
  if (artistPart === cleanedArtist) {
    score += 40; // Exact artist match
  } else if (artistPart.includes(cleanedArtist)) {
    score += 20; // Partial artist match
  }

  // Title matching (40 points max)
  if (titlePart === cleanedTitle) {
    score += 40; // Exact title match
  } else if (titlePart.includes(cleanedTitle)) {
    score += 20; // Partial title match
  }

  // Year validation (20 points max)
  const year = parseInt(result.year, 10);
  if (!isNaN(year) && year >= 1900 && year <= new Date().getFullYear()) {
    score += 20; // Valid year
  }

  // console.log('Match score calculation:', {
  //   result: result.title,
  //   year: result.year,
  //   artistScore: score <= 40 ? score : 40,
  //   titleScore: score > 40 ? score - 40 : 0,
  //   yearScore: score > 80 ? score - 80 : 0,
  //   totalScore: score
  // });

  return score;
}


export async function getDiscogsData(song: Song): Promise<ProcessedSong> {
  try {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Delay for rate limit

    const headers = {
      'User-Agent': 'MusikQuiz/1.0.0',
      'Authorization': `Discogs token=${config.discogs.apiKey}`
    };

    const cleanedTitle = song.title.replace(/\([^)]*\)|\[[^\]]*\]|[^ \w-]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const cleanedArtist = song.artist.replace(/[^ \w-]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

    console.log('\n=== Starting Discogs search ===');
    console.log('Original song data:', { artist: song.artist, title: song.title });
    console.log('Cleaned song data:', { artist: cleanedArtist, title: cleanedTitle });

    let searchQuery = `${cleanedArtist} ${cleanedTitle}`;
    let searchUrl = `${DISCOGS_API_URL}/database/search?q=${encodeURIComponent(searchQuery)}&type=master&per_page=10&sort=year,asc`;
    console.log('\nTrying combined search...');
    console.log('Search URL:', searchUrl);
    let searchResponse = await fetch(searchUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!searchResponse.ok) throw new Error('Failed to search Discogs (Combined)');

    let searchData = await searchResponse.json();
    console.log('Combined search results count:', searchData.results?.length || 0);

    if (!searchData.results?.length) {
      console.log('\nNo results found, trying artist-only search...');
      searchQuery = `artist:"${cleanedArtist}"`;
      searchUrl = `${DISCOGS_API_URL}/database/search?q=${encodeURIComponent(searchQuery)}&type=master&per_page=20&sort=year,asc`;
      console.log('Search URL:', searchUrl);
      searchResponse = await fetch(searchUrl, { headers });
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!searchResponse.ok) throw new Error('Failed to search Discogs (Artist Only)');
      searchData = await searchResponse.json();
      console.log('Artist-only search results count:', searchData.results?.length || 0);
    }

    if (!searchData.results?.length) {
      console.log('No Discogs results found, using Spotify data');
      return fallbackToSpotify(song);
    }

    // ... (Match score calculation and best match finding as before) ...
    let bestMatch = null;
    let bestMatchScore = -1;
    for (const result of searchData.results) {
      const score = calculateMatchScore(result, cleanedArtist, cleanedTitle);
      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatch = result;
      }
    }

    if (!bestMatch || bestMatchScore < 80) {
      console.log('\nNo good match found, score too low:', bestMatchScore);
      return fallbackToSpotify(song);
    }
    console.log('\nBest match found:', { title: bestMatch.title, year: bestMatch.year, score: bestMatchScore, id: bestMatch.id });


    const masterUrl = `${DISCOGS_API_URL}/masters/${bestMatch.id}`;
    console.log('\nFetching master details from:', masterUrl);
    const masterResponse = await fetch(masterUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!masterResponse.ok) throw new Error('Failed to fetch master details');
    const masterData = await masterResponse.json();
    console.log('Master release data:', { id: masterData.id, title: masterData.title, year: masterData.year, mainRelease: masterData.main_release });


    const releaseUrl = `${DISCOGS_API_URL}/releases/${masterData.main_release}`;
    console.log('\nFetching main release details from:', releaseUrl);
    const releaseResponse = await fetch(releaseUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!releaseResponse.ok) throw new Error('Failed to fetch release details');
    const releaseData = await releaseResponse.json();
    console.log('Release details:', { id: releaseData.id, title: releaseData.title, released: releaseData.released });


    const format = releaseData.formats?.[0];
    if (format?.descriptions?.some((desc: string) => ['promo', 'sampler', 'test pressing', 'advance', 'acetate'].some(keyword => desc.toLowerCase().includes(keyword)))) {
      console.log('Skipping promo/sampler release, using Spotify data');
      return fallbackToSpotify(song);
    }

    const releaseDate = { year: masterData.year?.toString() || 'N/A', month: 'N/A', day: 'N/A' };
    if (releaseData.released) {
      const parts = releaseData.released.split('-');
      if (parts[0]) releaseDate.year = parts[0];
      if (parts[1]) releaseDate.month = getMonthName(parts[1]);
      if (parts[2]) releaseDate.day = parts[2];
    }

    const year = parseInt(releaseDate.year, 10);
    if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) {
      console.log('Invalid release year, using Spotify data');
      return fallbackToSpotify(song);
    }

    console.log('\nFinal release date:', releaseDate);
    return {
      artist: song.artist,
      title: song.title,
      currentReleaseDate: song.currentReleaseDate,
      spotifyUrl: song.spotifyUrl,
      releaseYear: releaseDate.year,
      releaseMonth: releaseDate.month,
      releaseDay: releaseDate.day,
      source: 'discogs',
      sourceUrl: `https://www.discogs.com/master/${bestMatch.id}`
    };
  } catch (error) {
    console.error(`Error processing song ${song.title} with Discogs:`, error);
    return fallbackToSpotify(song); // Fallback on any error during Discogs process
  }
}

// Main function to get release data (calls Discogs, could add more sources later)
export async function getReleaseData(song: Song): Promise<ProcessedSong> {
  console.log('>>> Entering getReleaseData for:', song.title);
  console.log(`Attempting Discogs lookup for: ${song.title}`);

  try {
    const processedSong = await getDiscogsData(song);

    // Ensure year is valid before returning, otherwise use fallback
    if (!processedSong.releaseYear || processedSong.releaseYear === 'N/A') {
       console.warn(`Discogs lookup for ${song.title} resulted in invalid year (${processedSong.releaseYear}). Using Spotify fallback.`);
       return fallbackToSpotify(song);
    }
    return processedSong;

  } catch (error) {
      console.error(`Error during getDiscogsData call for ${song.title}:`, error);
      console.log(`Falling back to Spotify due to error for: ${song.title}`);
      return fallbackToSpotify(song);
  }
}
