import { NextResponse, NextRequest } from 'next/server';
import { config } from '@/app/config/config';
import { Redis } from "@upstash/redis"; // Import Upstash Redis client
import { v4 as uuidv4 } from 'uuid'; // Import uuid for job IDs

const DISCOGS_API_URL = 'https://api.discogs.com';

// Redefine ProcessedSong without extends
export interface ProcessedSong {
  // Fields from original Song interface
  artist: string;
  title: string;
  currentReleaseDate: string; // From Spotify initially
  spotifyUrl: string;
  // Added fields
  releaseYear: string;
  releaseMonth: string;
  releaseDay: string;
  source: 'deezer' | 'discogs' | 'spotify'; 
  sourceUrl?: string;
}

// Keep original Song interface
export interface Song {
  artist: string;
  title: string;
  currentReleaseDate: string; // From Spotify initially
  spotifyUrl: string;
}

// Initialize Redis client using environment variables
const redis = new Redis({
  url: process.env.KV_REST_API_URL || '', // Use Vercel's standard env var names
  token: process.env.KV_REST_API_TOKEN || '',
});

function getMonthName(monthNum: string | undefined): string {
  if (!monthNum) return 'N/A';
  const num = parseInt(monthNum, 10);
  if (isNaN(num) || num < 1 || num > 12) return 'N/A';
  return ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][num - 1];
}

async function getDiscogsData(song: Song): Promise<ProcessedSong> {
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

// Ensure fallbackToSpotify returns the full ProcessedSong structure
function fallbackToSpotify(song: Song): ProcessedSong {
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

// Simplified getReleaseData function - Discogs first
async function getReleaseData(song: Song): Promise<ProcessedSong> {
  console.log('>>> Entering getReleaseData for:', song.title);
  console.log(`Attempting Discogs lookup for: ${song.title}`);
  
  // Directly call getDiscogsData. It already contains the logic to fallback to Spotify if needed.
  try {
    const processedSong = await getDiscogsData(song); 
    
    // Add a check to ensure we have *some* result, even if it's the fallback
    if (!processedSong) { 
       // This case should theoretically not happen if getDiscogsData always returns ProcessedSong
       console.error(`Catastrophic failure: getDiscogsData returned undefined/null for ${song.title}. Using basic fallback.`);
       return fallbackToSpotify(song); // Return fallback explicitly just in case
    }
    
    // Ensure releaseYear is valid before returning, otherwise use fallback
    if (!processedSong.releaseYear || processedSong.releaseYear === 'N/A') {
       console.warn(`Discogs lookup for ${song.title} resulted in invalid year (${processedSong.releaseYear}). Using Spotify fallback.`);
       return fallbackToSpotify(song);
    }

    return processedSong;

  } catch (error) {
      console.error(`Error during getDiscogsData call for ${song.title}:`, error);
      console.log(`Falling back to Spotify due to error for: ${song.title}`);
      return fallbackToSpotify(song); // Fallback if getDiscogsData throws an unhandled error
  }
}

// --- Background Processing Function --- 
async function processRemainingSongsInBackground(
    remainingSongs: Song[], 
    jobId: string, 
    initialReleaseYear: string
) {
    console.log(`[Job ${jobId}] Starting background processing for ${remainingSongs.length} songs.`);
    const resultsKey = `${jobId}:results`;
    const yearsKey = `${jobId}:years`; 
    const statusKey = `${jobId}:status`;

    try {
        // Initialize Redis store for this job
        await redis.set(yearsKey, JSON.stringify([initialReleaseYear]), { ex: 3600 }); 
        await redis.set(statusKey, 'processing', { ex: 3600 });
        await redis.del(resultsKey);

        const processedYears = new Set<string>([initialReleaseYear]);
        let count = 0;

        for (const song of remainingSongs) {
            count++;
            console.log(`[Job ${jobId}] Processing song ${count}/${remainingSongs.length}: ${song.title}`);
            try {
                const processedSong = await getReleaseData(song);
                
                if (processedSong && processedSong.releaseYear && processedSong.releaseYear !== 'N/A') {
                    if (!processedYears.has(processedSong.releaseYear)) {
                        processedYears.add(processedSong.releaseYear);
                        // Revert: Push the STRINGIFIED object to list in Redis
                        await redis.lpush(resultsKey, JSON.stringify(processedSong));
                        // Update the set of years in Redis (still needs stringify for the Set)
                        await redis.set(yearsKey, JSON.stringify(Array.from(processedYears)), { ex: 3600 });
                        console.log(`[Job ${jobId}] Added song ${song.title} (${processedSong.releaseYear})`);
                    } else {
                        console.log(`[Job ${jobId}] Skipping song ${song.title} - year ${processedSong.releaseYear} already processed.`);
                    }
                } else {
                    console.log(`[Job ${jobId}] Skipping song ${song.title} - failed processing or invalid year.`);
                }
            } catch (songError) {
                console.error(`[Job ${jobId}] Error processing individual song ${song.title}:`, songError);
                // Continue to next song
            }
            // Optional: Add small delay between processing each song in background?
            // await new Promise(resolve => setTimeout(resolve, 100)); 
        }

        // Mark job as complete
        await redis.set(statusKey, 'complete', { ex: 3600 });
        console.log(`[Job ${jobId}] Background processing complete.`);

    } catch (error) {
        console.error(`[Job ${jobId}] Error during background processing:`, error);
        await redis.set(statusKey, 'failed', { ex: 3600 });
    }
}

// --- API Endpoint --- 
export async function POST(request: NextRequest) {
  try {
    // Expect payload: { firstSong: Song, remainingSongs: Song[] }
    const payload = await request.json();
    const { firstSong, remainingSongs }: { firstSong: Song, remainingSongs: Song[] } = payload;

    if (!firstSong || !Array.isArray(remainingSongs)) {
      return NextResponse.json({ error: 'Invalid payload structure. Expecting { firstSong, remainingSongs }.' }, { status: 400 });
    }

    console.log(`Received request: Process 1 song now, ${remainingSongs.length} in background.`);

    // --- Process First Song --- 
    console.log(`Processing first song synchronously: "${firstSong.title}"`);
    let processedFirstSong: ProcessedSong;
    try {
        processedFirstSong = await getReleaseData(firstSong);
    } catch (error) {
        console.error(`Critical error processing first song ${firstSong.title}:`, error);
        // If first song fails, fallback to Spotify data for it and continue background for others
        processedFirstSong = fallbackToSpotify(firstSong);
        // Optionally, could decide to fail the whole request here if first song is critical
        // return NextResponse.json({ error: 'Failed to process initial song' }, { status: 500 });
    }
    
    if (!processedFirstSong.releaseYear || processedFirstSong.releaseYear === 'N/A') {
        console.warn(`First song "${firstSong.title}" could not be processed with a valid year. Using fallback data.`);
        // Ensure it has some year, even if 'N/A' or from Spotify fallback
    }

    // --- Start Background Processing --- 
    const jobId = uuidv4(); // Generate unique job ID
    const initialReleaseYear = processedFirstSong.releaseYear; // Get year from the processed first song

    // Trigger background task - DO NOT AWAIT
    processRemainingSongsInBackground(remainingSongs, jobId, initialReleaseYear).catch(err => {
        console.error(`[Job ${jobId}] Background task initiation failed:`, err);
        redis.set(`${jobId}:status`, 'init_failed', { ex: 3600 }).catch(); // Attempt to mark status using redis
    });
    console.log(`[Job ${jobId}] Initiated background task for ${remainingSongs.length} songs.`);

    // --- Return Initial Response --- 
    return NextResponse.json({
        processedSong: processedFirstSong, // Send the first song processed
        jobId: jobId                     // Send the ID for the background job
    });

  } catch (error) {
    console.error('Error in POST /api/process-songs:', error);
    return NextResponse.json({ error: 'Failed to process songs request' }, { status: 500 });
  }
} 