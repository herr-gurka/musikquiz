// Discogs API configuration
const DISCOGS_API_URL = 'https://api.discogs.com';

// Get the API key from environment variables
const DISCOGS_API_KEY = process.env.DISCOGS_API_KEY;

if (!DISCOGS_API_KEY) {
  console.error('DISCOGS_API_KEY environment variable is not set');
}

const DISCOGS_HEADERS = {
  'User-Agent': 'MusikQuiz/1.0.0',
  'Authorization': `Discogs token=${DISCOGS_API_KEY}`
};

// Types for Discogs API responses
interface DiscogsSearchResult {
  id: number;
  title: string;
  year: string;
  thumb: string;
  cover_image: string;
  type: string;
}

interface DiscogsRelease {
  id: number;
  title: string;
  year: string;
  released: string;
  artists: Array<{
    name: string;
    id: number;
  }>;
  labels: Array<{
    name: string;
    catno: string;
  }>;
  formats: Array<{
    name: string;
    qty: string;
    descriptions: string[];
  }>;
  tracklist: Array<{
    position: string;
    title: string;
    duration: string;
  }>;
}

interface ReleaseDate {
  year: string;
  month: string;  // Will be month name or "N/A"
  day: string;    // Will be day number or "N/A"
  fullDate: string; // Original full date for reference
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Helper function to parse release date
function parseReleaseDate(dateStr: string, year?: string): ReleaseDate {
  // Initialize with default values
  const result: ReleaseDate = {
    year: 'N/A',
    month: 'N/A',
    day: 'N/A',
    fullDate: dateStr || ''
  };

  if (!dateStr && year) {
    // If we only have a year, use that
    result.year = year;
    return result;
  }

  if (!dateStr) {
    return result;
  }

  // Try to parse the date string
  const parts = dateStr.split('-');
  
  // Year
  if (parts[0]) {
    result.year = parts[0];
  }

  // Month
  if (parts[1]) {
    const monthNum = parseInt(parts[1], 10);
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      result.month = MONTHS[monthNum - 1];
    }
  }

  // Day
  if (parts[2]) {
    const dayNum = parseInt(parts[2], 10);
    if (!isNaN(dayNum)) {
      result.day = dayNum.toString();
    }
  }

  return result;
}

// Helper function to clean up song titles
export function cleanTitle(title: string): string {
  return title
    .replace(/\([^)]*\)/g, '') // Remove parenthetical content
    .replace(/\[[^\]]*\]/g, '') // Remove bracketed content
    .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
    .toLowerCase();
}

// Helper function to clean up artist names
export function cleanArtist(artist: string): string {
  return artist
    .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
    .toLowerCase();
}

// Helper function to check if a release is a promo or sampler
function isPromoOrSampler(release: DiscogsRelease): boolean {
  const format = release.formats?.[0];
  if (!format) return false;

  // Check format descriptions
  const descriptions = format.descriptions || [];
  const promoKeywords = ['promo', 'sampler', 'test pressing', 'advance', 'acetate'];
  
  return descriptions.some(desc => 
    promoKeywords.some(keyword => desc.toLowerCase().includes(keyword))
  );
}

// Helper function to delay execution (for rate limiting)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// We'll add the main function to search for release dates in the next step 

export async function getOriginalReleaseDate(
  artist: string,
  title: string
): Promise<{ date: ReleaseDate | null; releaseId?: number }> {
  try {
    // Clean the title and artist for better matching
    const cleanedTitle = cleanTitle(title);
    const cleanedArtist = cleanArtist(artist);

    // Step 1: Search for releases
    const searchQuery = `${cleanedTitle} ${cleanedArtist}`;
    console.log('Searching Discogs for:', searchQuery);
    console.log('Cleaned title:', cleanedTitle);
    console.log('Cleaned artist:', cleanedArtist);
    
    const searchUrl = `${DISCOGS_API_URL}/database/search?q=${encodeURIComponent(searchQuery)}&type=release&per_page=20&sort=year&sort_order=asc`;
    console.log('Search URL:', searchUrl);
    
    const searchResponse = await fetch(searchUrl, { headers: DISCOGS_HEADERS });
    await delay(1000); // Rate limiting

    if (!searchResponse.ok) {
      console.error('Failed to search Discogs:', searchResponse.statusText, await searchResponse.text());
      return { date: null };
    }

    const searchData = await searchResponse.json();
    console.log(`Found ${searchData.results?.length || 0} releases`);

    if (!searchData.results?.length) {
      return { date: null };
    }

    // Step 2: Get details for each potential release
    const releases: { release: DiscogsRelease; date: ReleaseDate }[] = [];
    
    // Only check the first 5 releases, since they're already sorted by year
    for (const result of searchData.results.slice(0, 5)) {
      try {
        const releaseUrl = `${DISCOGS_API_URL}/releases/${result.id}`;
        const releaseResponse = await fetch(releaseUrl, { headers: DISCOGS_HEADERS });
        await delay(1000);

        if (!releaseResponse.ok) {
          console.warn('Failed to get release details:', result.id);
          continue;
        }

        const releaseData: DiscogsRelease = await releaseResponse.json();

        // Skip promos and samplers
        if (isPromoOrSampler(releaseData)) {
          console.log(`Release ${result.id} is a promo/sampler - skipping`);
          continue;
        }
        
        // Check if this release actually contains our track
        const hasTrack = releaseData.tracklist.some(track => {
          const cleanedTrackTitle = cleanTitle(track.title);
          return cleanedTrackTitle.includes(cleanedTitle) || cleanedTitle.includes(cleanedTrackTitle);
        });

        if (!hasTrack) {
          console.log(`Release ${result.id} doesn't contain the track`);
          continue;
        }

        // Check if this is by our artist
        const isCorrectArtist = releaseData.artists.some(artist => {
          const cleanedReleaseArtist = cleanArtist(artist.name);
          return cleanedReleaseArtist.includes(cleanedArtist) || cleanedArtist.includes(cleanedReleaseArtist);
        });

        if (!isCorrectArtist) {
          console.log(`Release ${result.id} is not by the correct artist`);
          continue;
        }

        const releaseDate = parseReleaseDate(releaseData.released, releaseData.year);
        
        // If we found a valid release with full date info, we can stop here
        // since results are already sorted by year
        if (releaseDate.year !== 'N/A') {
          console.log('Found valid release with date info:', {
            id: result.id,
            title: releaseData.title,
            year: releaseData.year,
            released: releaseData.released,
            format: releaseData.formats?.[0]?.name,
            descriptions: releaseData.formats?.[0]?.descriptions
          });
          return { date: releaseDate, releaseId: result.id };
        }
        
        releases.push({ release: releaseData, date: releaseDate });
      } catch (error) {
        console.warn('Error getting release details:', error);
        continue;
      }
    }

    if (releases.length === 0) {
      console.log('No valid releases found');
      return { date: null };
    }

    // If we get here, we only have releases without full date info
    // Sort them by format priority
    const sortedReleases = releases.sort((a, b) => {
      const formatA = a.release.formats?.[0]?.name?.toLowerCase() || '';
      const formatB = b.release.formats?.[0]?.name?.toLowerCase() || '';
      
      // Prioritize singles and albums over compilations
      const getFormatPriority = (format: string) => {
        if (format.includes('single')) return 1;
        if (format.includes('album')) return 2;
        if (format.includes('compilation')) return 4;
        return 3;
      };

      return getFormatPriority(formatA) - getFormatPriority(formatB);
    });

    const bestRelease = sortedReleases[0];
    console.log('Selected best release:', {
      id: bestRelease.release.id,
      title: bestRelease.release.title,
      date: bestRelease.date,
      format: bestRelease.release.formats?.[0]?.name
    });

    return { 
      date: bestRelease.date,
      releaseId: bestRelease.release.id
    };
  } catch (error) {
    console.error('Error getting original release date from Discogs:', error);
    return { date: null };
  }
} 