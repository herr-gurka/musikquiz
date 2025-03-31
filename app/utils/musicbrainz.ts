interface MusicBrainzRelease {
  id: string;
  title: string;
  date?: string;
  'release-group'?: {
    'first-release-date'?: string;
    title?: string;
  };
  artist?: {
    name: string;
  };
  media?: {
    tracks?: {
      title: string;
      recording?: {
        id: string;
        title: string;
        'first-release-date'?: string;
        'releases'?: {
          date?: string;
        }[];
      };
    }[];
  }[];
}

interface MusicBrainzReleaseGroup {
  id: string;
  title: string;
  'first-release-date'?: string;
  type?: string;
  releases?: {
    date?: string;
  }[];
  artist?: {
    name: string;
  };
}

interface MusicBrainzSearchResponse {
  releases: MusicBrainzRelease[];
  'release-groups': MusicBrainzReleaseGroup[];
}

// Constants for MusicBrainz API
const MUSICBRAINZ_API_URL = 'https://musicbrainz.org/ws/2';
const MUSICBRAINZ_HEADERS = {
  'User-Agent': 'MusikQuiz/1.0.0 (admin@example.com)',
};

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to clean up song titles
export function cleanTitle(title: string): string {
  return title
    .replace(/\([^)]*\)/g, '') // Remove parenthetical content
    .replace(/\[[^\]]*\]/g, '') // Remove bracketed content
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
    .toLowerCase();
}

export function cleanArtist(artist: string): string {
  return artist
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
    .toLowerCase();
}

// Helper function to normalize text for comparison
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'") // Normalize apostrophes
    .replace(/[""]/g, '"') // Normalize quotes
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

// Helper function to format date to YYYY-MM-DD
function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 1) {
    // If we only have a year, use January 1st
    return `${parts[0]}-01-01`;
  }
  if (parts.length === 2) {
    // If we have year and month, use the 1st of the month
    return `${parts[0]}-${parts[1]}-01`;
  }
  // If we have a full date, return it as is
  return dateStr;
}

// Helper function to parse date string
function parseDate(dateStr: string): { year: number; month?: number; day?: number } | null {
  const parts = dateStr.split('-');
  if (parts.length < 1) return null;
  
  const year = parseInt(parts[0]);
  if (isNaN(year)) return null;
  
  const result: { year: number; month?: number; day?: number } = { year };
  
  if (parts.length >= 2) {
    const month = parseInt(parts[1]);
    if (!isNaN(month)) result.month = month;
  }
  
  if (parts.length >= 3) {
    const day = parseInt(parts[2]);
    if (!isNaN(day)) result.day = day;
  }
  
  return result;
}

// Helper function to validate release date
function isValidReleaseDate(date: string): boolean {
  const parsedDate = parseDate(date);
  if (!parsedDate) return false;

  // Basic validation rules
  if (parsedDate.year < 1900 || parsedDate.year > new Date().getFullYear()) {
    console.log(`Invalid release year ${parsedDate.year}`);
    return false;
  }

  return true;
}

// Helper function to get release date with rate limiting
export async function getOriginalReleaseDate(
  artist: string,
  title: string,
  album?: string
): Promise<{ date: string | null; recordingId?: string }> {
  try {
    // Clean the title and artist for better matching
    const cleanedTitle = cleanTitle(title);
    const cleanedArtist = cleanArtist(artist);

    // Step 1: Search for the recording directly
    const recordingQuery = `recording:"${cleanedTitle}" AND artist:"${cleanedArtist}"`;
    console.log('Searching for recording:', recordingQuery);
    
    const recordingSearchResponse = await fetch(
      `${MUSICBRAINZ_API_URL}/recording?query=${encodeURIComponent(recordingQuery)}&fmt=json&limit=10`,
      { headers: MUSICBRAINZ_HEADERS }
    );
    await delay(2000);

    if (!recordingSearchResponse.ok) {
      console.error('Failed to search recording:', recordingSearchResponse.statusText);
      return { date: null };
    }

    const recordingSearchData = await recordingSearchResponse.json();
    console.log('Found recordings:', recordingSearchData.recordings.map((r: any) => ({
      title: r.title,
      id: r.id
    })));

    // Find matching recording
    const matchingRecording = recordingSearchData.recordings.find((r: any) => 
      cleanTitle(r.title) === cleanedTitle
    );

    if (!matchingRecording) {
      console.log('No matching recording found');
      return { date: null };
    }

    // Step 2: Get the recording details with releases and release-groups
    console.log('Getting recording details:', matchingRecording.id);
    const recordingResponse = await fetch(
      `${MUSICBRAINZ_API_URL}/recording/${matchingRecording.id}?fmt=json&inc=releases+release-groups`,
      { headers: MUSICBRAINZ_HEADERS }
    );
    await delay(2000);

    if (!recordingResponse.ok) {
      console.error('Failed to get recording details:', recordingResponse.statusText);
      return { date: null };
    }

    const recordingData = await recordingResponse.json();
    console.log('Recording details:', {
      title: recordingData.title,
      releases: recordingData.releases?.map((r: any) => ({
        title: r.title,
        date: r.date
      })),
      releaseGroups: recordingData['release-groups']?.map((rg: any) => ({
        title: rg.title,
        'first-release-date': rg['first-release-date']
      }))
    });

    // Collect all valid dates from different sources
    const validDates: string[] = [];

    // 1. Add dates from releases
    if (recordingData.releases) {
      recordingData.releases.forEach((release: any) => {
        if (release.date && release.date.length >= 4) {
          validDates.push(release.date);
        }
      });
    }

    // 2. Add dates from release groups
    if (recordingData['release-groups']) {
      recordingData['release-groups'].forEach((rg: any) => {
        if (rg['first-release-date'] && rg['first-release-date'].length >= 4) {
          validDates.push(rg['first-release-date']);
        }
      });
    }

    if (validDates.length === 0) {
      console.log('No valid release dates found');
      return { date: null, recordingId: matchingRecording.id };
    }

    // Find the earliest date by comparing full dates
    const earliestDate = validDates.reduce((earliest: string, current: string) => {
      // If current date is earlier, use it
      if (current < earliest) {
        return current;
      }
      return earliest;
    });

    console.log('Found earliest release date:', earliestDate);
    return { date: earliestDate, recordingId: matchingRecording.id };
  } catch (error) {
    console.error('Error getting original release date:', error);
    return { date: null };
  }
}