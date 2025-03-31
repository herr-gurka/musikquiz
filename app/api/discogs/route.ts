import { NextResponse, NextRequest } from 'next/server';

const DISCOGS_API_URL = 'https://api.discogs.com';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const artist = searchParams.get('artist');
    const title = searchParams.get('title');

    if (!artist || !title) {
      return NextResponse.json({ error: 'Artist and title are required' }, { status: 400 });
    }

    const DISCOGS_API_KEY = process.env.DISCOGS_API_KEY;
    console.log('Discogs API Key present:', !!DISCOGS_API_KEY);
    
    if (!DISCOGS_API_KEY) {
      console.error('Discogs API key not configured');
      return NextResponse.json({ error: 'Discogs API key not configured' }, { status: 500 });
    }

    const headers = {
      'User-Agent': 'MusikQuiz/1.0.0',
      'Authorization': `Discogs token=${DISCOGS_API_KEY}`
    };

    // Clean the title and artist for better matching
    const cleanedTitle = title
      .replace(/\([^)]*\)/g, '') // Remove parenthetical content
      .replace(/\[[^\]]*\]/g, '') // Remove bracketed content
      .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim()
      .toLowerCase();

    const cleanedArtist = artist
      .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim()
      .toLowerCase();

    // Step 1: Search for releases
    const searchQuery = `${cleanedTitle} ${cleanedArtist}`;
    console.log('Searching Discogs for:', searchQuery);
    console.log('Cleaned title:', cleanedTitle);
    console.log('Cleaned artist:', cleanedArtist);
    
    const searchUrl = `${DISCOGS_API_URL}/database/search?q=${encodeURIComponent(searchQuery)}&type=release&per_page=20&sort=year&sort_order=asc`;
    console.log('Search URL:', searchUrl);
    
    const searchResponse = await fetch(searchUrl, { headers });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Failed to search Discogs:', searchResponse.status, searchResponse.statusText, errorText);
      return NextResponse.json({ error: 'Failed to search Discogs' }, { status: searchResponse.status });
    }

    const searchData = await searchResponse.json();

    if (!searchData.results?.length) {
      return NextResponse.json({ date: null });
    }

    // Step 2: Get details for each potential release
    const releases = [];
    
    // Only check the first 5 releases, since they're already sorted by year
    for (const result of searchData.results.slice(0, 5)) {
      try {
        const releaseUrl = `${DISCOGS_API_URL}/releases/${result.id}`;
        const releaseResponse = await fetch(releaseUrl, { headers });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting

        if (!releaseResponse.ok) {
          continue;
        }

        const releaseData = await releaseResponse.json();

        // Skip promos and samplers
        const format = releaseData.formats?.[0];
        if (format?.descriptions?.some((desc: string) => 
          ['promo', 'sampler', 'test pressing', 'advance', 'acetate'].some(keyword => 
            desc.toLowerCase().includes(keyword)
          )
        )) {
          continue;
        }
        
        // Check if this release actually contains our track
        const hasTrack = releaseData.tracklist.some((track: any) => {
          const cleanedTrackTitle = track.title
            .replace(/\([^)]*\)/g, '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          return cleanedTrackTitle.includes(cleanedTitle) || cleanedTitle.includes(cleanedTrackTitle);
        });

        if (!hasTrack) {
          continue;
        }

        // Check if this is by our artist
        const isCorrectArtist = releaseData.artists.some((artist: any) => {
          const cleanedReleaseArtist = artist.name
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          return cleanedReleaseArtist.includes(cleanedArtist) || cleanedArtist.includes(cleanedReleaseArtist);
        });

        if (!isCorrectArtist) {
          continue;
        }

        // Parse release date
        const releaseDate = {
          year: 'N/A',
          month: 'N/A',
          day: 'N/A',
          fullDate: releaseData.released || ''
        };

        if (releaseData.released) {
          const parts = releaseData.released.split('-');
          if (parts[0]) releaseDate.year = parts[0];
          if (parts[1]) {
            const monthNum = parseInt(parts[1], 10);
            if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
              releaseDate.month = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'][monthNum - 1];
            }
          }
          if (parts[2]) {
            const dayNum = parseInt(parts[2], 10);
            if (!isNaN(dayNum)) {
              releaseDate.day = dayNum.toString();
            }
          }
        }

        // If we found a valid release with full date info, we can stop here
        if (releaseDate.year !== 'N/A') {
          return NextResponse.json({ 
            date: releaseDate,
            releaseId: result.id
          });
        }
        
        releases.push({ release: releaseData, date: releaseDate });
      } catch (error) {
        continue;
      }
    }

    if (releases.length === 0) {
      return NextResponse.json({ date: null });
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
    return NextResponse.json({ 
      date: bestRelease.date,
      releaseId: bestRelease.release.id
    });
  } catch (error) {
    console.error('Error in Discogs API route:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
} 