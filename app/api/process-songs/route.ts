import { NextResponse, NextRequest } from 'next/server';
import { config } from '@/app/config/config';

const DISCOGS_API_URL = 'https://api.discogs.com';

interface Song {
  artist: string;
  title: string;
  currentReleaseDate: string;
  spotifyUrl: string;
}

function getMonthName(monthNum: string | undefined): string {
  if (!monthNum) return 'N/A';
  const num = parseInt(monthNum, 10);
  if (isNaN(num) || num < 1 || num > 12) return 'N/A';
  return ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][num - 1];
}

async function getDiscogsData(song: Song) {
  try {
    // Add a delay before each Discogs request to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));

    const headers = {
      'User-Agent': 'MusikQuiz/1.0.0',
      'Authorization': `Discogs token=${config.discogs.apiKey}`
    };

    // Clean the title and artist for better matching
    const cleanedTitle = song.title
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const cleanedArtist = song.artist
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    console.log('\n=== Starting Discogs search ===');
    console.log('Original song data:', { artist: song.artist, title: song.title });
    console.log('Cleaned song data:', { artist: cleanedArtist, title: cleanedTitle });

    // Start with a simple search combining artist and title
    let searchQuery = `${cleanedArtist} ${cleanedTitle}`;
    let searchUrl = `${DISCOGS_API_URL}/database/search?q=${encodeURIComponent(searchQuery)}&type=master&per_page=10&sort=year,asc`;
    
    console.log('\nTrying combined search...');
    console.log('Search URL:', searchUrl);
    let searchResponse = await fetch(searchUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

    if (!searchResponse.ok) {
      throw new Error('Failed to search Discogs');
    }

    let searchData = await searchResponse.json();
    console.log('Combined search results count:', searchData.results?.length || 0);

    // If no results, try with just the artist name
    if (!searchData.results?.length) {
      console.log('\nNo results found, trying artist-only search...');
      searchQuery = `artist:"${cleanedArtist}"`;
      searchUrl = `${DISCOGS_API_URL}/database/search?q=${encodeURIComponent(searchQuery)}&type=master&per_page=20&sort=year,asc`;
      console.log('Search URL:', searchUrl);
      
      searchResponse = await fetch(searchUrl, { headers });
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

      if (!searchResponse.ok) {
        throw new Error('Failed to search Discogs');
      }

      searchData = await searchResponse.json();
      console.log('Artist-only search results count:', searchData.results?.length || 0);
    }

    if (!searchData.results?.length) {
      console.log('No Discogs results found, using Spotify data');
      return fallbackToSpotify(song);
    }

    console.log('\nTop 3 search results:');
    searchData.results.slice(0, 3).forEach((result: any, index: number) => {
      console.log(`\nResult ${index + 1}:`);
      console.log('Title:', result.title);
      console.log('Year:', result.year);
      console.log('Format:', result.format?.join(', '));
      console.log('Type:', result.type);
      console.log('ID:', result.id);
      const score = calculateMatchScore(result, cleanedArtist, cleanedTitle);
      console.log('Match score:', score);
    });

    // Find the best matching release
    let bestMatch = null;
    let bestMatchScore = -1;

    for (const result of searchData.results) {
      const score = calculateMatchScore(result, cleanedArtist, cleanedTitle);
      
      // Only consider results with a minimum match quality
      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatch = result;
      }
    }

    if (!bestMatch || bestMatchScore < 80) {  // Require a high confidence match
      console.log('\nNo good match found, score too low:', bestMatchScore);
      return fallbackToSpotify(song);
    }

    console.log('\nBest match found:', {
      title: bestMatch.title,
      year: bestMatch.year,
      score: bestMatchScore,
      id: bestMatch.id
    });

    // Get details for the best matching master release
    const masterUrl = `${DISCOGS_API_URL}/masters/${bestMatch.id}`;
    console.log('\nFetching master details from:', masterUrl);
    const masterResponse = await fetch(masterUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

    if (!masterResponse.ok) {
      throw new Error('Failed to fetch master details');
    }

    const masterData = await masterResponse.json();
    console.log('Master release data:', {
      id: masterData.id,
      title: masterData.title,
      year: masterData.year,
      mainRelease: masterData.main_release,
      styles: masterData.styles,
      genres: masterData.genres
    });

    // Get the main release details for more accurate date
    const releaseUrl = `${DISCOGS_API_URL}/releases/${masterData.main_release}`;
    console.log('\nFetching main release details from:', releaseUrl);
    const releaseResponse = await fetch(releaseUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

    if (!releaseResponse.ok) {
      throw new Error('Failed to fetch release details');
    }

    const releaseData = await releaseResponse.json();
    console.log('Release details:', {
      id: releaseData.id,
      title: releaseData.title,
      released: releaseData.released,
      formats: releaseData.formats
    });

    // Skip promos and samplers
    const format = releaseData.formats?.[0];
    if (format?.descriptions?.some((desc: string) => 
      ['promo', 'sampler', 'test pressing', 'advance', 'acetate'].some(keyword => 
        desc.toLowerCase().includes(keyword)
      )
    )) {
      console.log('Skipping promo/sampler release, using Spotify data');
      return fallbackToSpotify(song);
    }

    // Parse release date
    const releaseDate = {
      year: masterData.year?.toString() || 'N/A',
      month: 'N/A',
      day: 'N/A'
    };

    if (releaseData.released) {
      const parts = releaseData.released.split('-');
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

    // Only validate that the year is within a reasonable range
    const year = parseInt(releaseDate.year, 10);
    if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) {
      console.log('Invalid release year, using Spotify data');
      return fallbackToSpotify(song);
    }

    console.log('\nFinal release date:', releaseDate);
    return {
      ...song,
      releaseYear: releaseDate.year,
      releaseMonth: releaseDate.month,
      releaseDay: releaseDate.day,
      source: 'discogs',
      sourceUrl: `https://www.discogs.com/master/${bestMatch.id}`
    };
  } catch (error) {
    console.error(`Error processing song ${song.title}:`, error);
    return fallbackToSpotify(song);
  }
}

// Helper function to calculate match score between a Discogs result and our search terms
function calculateMatchScore(result: any, cleanedArtist: string, cleanedTitle: string): number {
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

  console.log('Match score calculation:', {
    result: result.title,
    year: result.year,
    artistScore: score <= 40 ? score : 40,
    titleScore: score > 40 ? score - 40 : 0,
    yearScore: score > 80 ? score - 80 : 0,
    totalScore: score
  });

  return score;
}

// Helper function to return Spotify data
function fallbackToSpotify(song: Song) {
  return {
    ...song,
    releaseYear: song.currentReleaseDate.split('-')[0] || 'N/A',
    releaseMonth: getMonthName(song.currentReleaseDate.split('-')[1]),
    releaseDay: song.currentReleaseDate.split('-')[2] || 'N/A',
    source: 'spotify',
    sourceUrl: song.spotifyUrl
  };
}

export async function POST(request: NextRequest) {
  try {
    const songs = await request.json();
    if (!Array.isArray(songs)) {
      return NextResponse.json({ error: 'Songs must be an array' }, { status: 400 });
    }

    console.log(`Processing ${songs.length} songs in parallel batches...`);

    // Process songs in batches of 3
    const batchSize = 3;
    const processedSongs = [];
    
    for (let i = 0; i < songs.length; i += batchSize) {
      const batch = songs.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(songs.length/batchSize)}`);
      console.log('Batch songs:', batch.map(s => s.title).join(', '));

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(song => getDiscogsData(song))
      );

      processedSongs.push(...batchResults);

      // Add a small delay between batches to respect rate limits
      if (i + batchSize < songs.length) {
        console.log('Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return NextResponse.json(processedSongs);
  } catch (error) {
    console.error('Error processing songs:', error);
    return NextResponse.json({ error: 'Failed to process songs' }, { status: 500 });
  }
} 