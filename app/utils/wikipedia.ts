interface WikipediaSearchResult {
  query: {
    search: Array<{
      title: string;
      snippet: string;
    }>;
  };
}

interface WikipediaPageResult {
  query: {
    pages: {
      [key: string]: {
        title: string;
        extract: string;
      };
    };
  };
}

// Helper function to clean up text for searching
function cleanTitle(title: string): string {
  return title
    .replace(/\([^)]*\)/g, '') // Remove anything in parentheses
    .replace(/\[[^\]]*\]/g, '') // Remove anything in square brackets
    .replace(/\s*-\s*\d{4}\s*(?:remaster|version|mix|edit).*$/i, '') // Remove remaster/version info
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .trim();
}

// Helper function to normalize text for comparison
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

// Helper function to parse date from text
function parseDateFromText(text: string): string[] {
  const dates: string[] = [];
  
  // Look for dates in various formats
  const patterns = [
    // Day Month Year (e.g., "15 July 1997" or "July 15, 1997")
    /(\d{1,2})\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi,
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/gi,
    // Full date format (e.g., "1997-07-15")
    /(\d{4})-(\d{2})-(\d{2})/g,
    // Year only (e.g., "1997")
    /(?<!\d)\b(\d{4})\b(?!\d)/g
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0; // Reset regex state
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Handle year-only format
        if (/^\d{4}$/.test(match)) {
          dates.push(match);
          continue;
        }

        // Handle full date format
        if (match.includes('-')) {
          const [year, month, day] = match.split('-').map(Number);
          if (year >= 1900 && year <= 2025 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            dates.push(match);
          }
          continue;
        }

        // Handle "Month Day, Year" format
        const monthDayYearMatch = match.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
        if (monthDayYearMatch) {
          const [_, day, year] = monthDayYearMatch;
          const month = match.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)/i)?.[0];
          if (month && day && year) {
            const monthNum = new Date(`${month} 1`).getMonth() + 1;
            const dayNum = parseInt(day);
            const yearNum = parseInt(year);
            if (yearNum >= 1900 && yearNum <= 2025 && monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
              dates.push(`${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`);
            }
          }
          continue;
        }

        // Handle "Day Month Year" format
        const dayMonthYearMatch = match.match(/(\d{1,2})\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
        if (dayMonthYearMatch) {
          const [_, day, year] = dayMonthYearMatch;
          const month = match.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)/i)?.[0];
          if (month && day && year) {
            const monthNum = new Date(`${month} 1`).getMonth() + 1;
            const dayNum = parseInt(day);
            const yearNum = parseInt(year);
            if (yearNum >= 1900 && yearNum <= 2025 && monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
              dates.push(`${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`);
            }
          }
        }
      }
    }
  }

  // Look for a release date section specifically
  const releaseDateSection = text.match(/Released\s+(?:on\s+)?(?:in\s+)?([^\.]+)/i);
  if (releaseDateSection) {
    const dateText = releaseDateSection[1];
    const yearMatch = dateText.match(/\b\d{4}\b/);
    if (yearMatch) {
      dates.push(yearMatch[0]);
    }
  }

  return dates;
}

// Helper function to find the earliest date
function findEarliestDate(dates: string[]): string | null {
  if (dates.length === 0) return null;

  // Filter out invalid dates and sort them
  const validDates = dates
    .filter(date => {
      // Accept both full dates (YYYY-MM-DD) and years (YYYY)
      if (/^\d{4}$/.test(date)) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      
      const [year, month, day] = date.split('-').map(Number);
      return year >= 1900 && year <= 2025 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
    })
    .sort((a, b) => {
      // If both are years, compare directly
      if (/^\d{4}$/.test(a) && /^\d{4}$/.test(b)) {
        return a.localeCompare(b);
      }
      // If one is a year and one is a full date, compare years
      if (/^\d{4}$/.test(a)) {
        return a.localeCompare(b.substring(0, 4));
      }
      if (/^\d{4}$/.test(b)) {
        return a.substring(0, 4).localeCompare(b);
      }
      // If both are full dates, compare normally
      return a.localeCompare(b);
    });

  if (validDates.length === 0) return null;

  console.log('Found dates:', validDates);
  console.log('Using earliest date:', validDates[0]);
  return validDates[0];
}

export async function getWikipediaReleaseDate(artist: string, title: string): Promise<{ date: string | null; source: string; url: string }> {
  try {
    // Clean up the title for searching
    const cleanSongTitle = cleanTitle(title);
    const cleanArtistName = artist.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    
    console.log('\n=== Wikipedia Search ===');
    console.log('Original title:', title);
    console.log('Cleaned title:', cleanSongTitle);
    console.log('Original artist:', artist);
    console.log('Cleaned artist:', cleanArtistName);

    // Try different search queries in order of specificity
    const searchQueries = [
      // Most specific: exact title and artist with "song" keyword
      `${cleanSongTitle} ${cleanArtistName} song`,
      // Less specific: title and artist without "song" keyword
      `${cleanSongTitle} ${cleanArtistName}`,
      // Most general: just the title with "song" keyword
      `${cleanSongTitle} song`
    ];

    let searchData: WikipediaSearchResult | null = null;
    let searchUrl = '';

    for (const query of searchQueries) {
      searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=3`;
      console.log('\nTrying search query:', query);
      console.log('Search URL:', searchUrl);
      
      const searchResponse = await fetch(searchUrl);
      
      if (!searchResponse.ok) {
        console.error('Wikipedia search failed:', searchResponse.status);
        continue;
      }

      const currentSearchData = await searchResponse.json();
      console.log('Found search results:', currentSearchData.query.search.length);
      
      // Log all search results
      currentSearchData.query.search.forEach((result: { title: string; snippet: string }, index: number) => {
        console.log(`\nResult ${index + 1}:`);
        console.log('Title:', result.title);
        console.log('Snippet:', result.snippet);
        console.log('URL:', `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`);
      });

      if (currentSearchData.query.search.length > 0) {
        searchData = currentSearchData;
        break;
      }
    }

    if (!searchData || !searchData.query.search.length) {
      console.log('No search results found with any query');
      return { date: null, source: 'wikipedia', url: '' };
    }

    // Get the first result's page ID
    const pageId = searchData.query.search[0].title;
    console.log('\nSelected page:', pageId);
    console.log('Page URL:', `https://en.wikipedia.org/wiki/${encodeURIComponent(pageId)}`);

    // Get the page content with infobox
    const pageUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(pageId)}&format=json&origin=*`;
    console.log('API URL for page content:', pageUrl);
    
    const pageResponse = await fetch(pageUrl);
    
    if (!pageResponse.ok) {
      console.error('Wikipedia page fetch failed:', pageResponse.status);
      return { date: null, source: 'wikipedia', url: '' };
    }

    const pageData: WikipediaPageResult = await pageResponse.json();
    const page = Object.values(pageData.query.pages)[0];
    
    if (!page || !page.extract) {
      console.log('No page content found');
      return { date: null, source: 'wikipedia', url: '' };
    }

    // Log the first part of the page content
    console.log('\nPage content preview:', page.extract.substring(0, 500) + '...');

    // Look for release date in the text, prioritizing the original release
    const dates = parseDateFromText(page.extract);
    if (dates.length > 0) {
      // Split the text into paragraphs
      const paragraphs = page.extract.split('\n\n');
      
      // Look for paragraphs mentioning our artist
      const artistParagraphs = paragraphs.filter(p => 
        p.toLowerCase().includes(cleanArtistName.toLowerCase())
      );

      if (artistParagraphs.length > 0) {
        // Look for dates in paragraphs mentioning our artist
        const artistDates = parseDateFromText(artistParagraphs.join('\n'));
        if (artistDates.length > 0) {
          const artistDate = findEarliestDate(artistDates);
          if (artistDate) {
            console.log('Found date in artist paragraph:', artistDate);
            return { 
              date: artistDate, 
              source: 'wikipedia',
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageId)}`
            };
          }
        }
      }

      // If no artist-specific date found, use the earliest date
      const earliestDate = findEarliestDate(dates);
      if (earliestDate) {
        console.log('Using earliest date found:', earliestDate);
        return { 
          date: earliestDate, 
          source: 'wikipedia',
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageId)}`
        };
      }
    }

    console.log('No release date found in text');
    return { date: null, source: 'wikipedia', url: '' };
  } catch (error) {
    console.error('Error fetching Wikipedia release date:', error);
    return { date: null, source: 'wikipedia', url: '' };
  }
} 