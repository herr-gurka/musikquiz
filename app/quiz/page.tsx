'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { searchSpotifyTrack } from '../utils/spotify';

interface Song {
  artist: string;
  title: string;
  releaseYear: string;
  year: number;
  spotifyUrl: string | undefined;
  completed?: boolean;
}

export default function QuizPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-500 to-purple-600">
        <div className="bg-white p-8 rounded-2xl shadow-2xl">
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
            <div className="text-2xl font-semibold text-gray-700">Loading quiz...</div>
          </div>
        </div>
      </div>
    }>
      <QuizContent />
    </Suspense>
  );
}

function QuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [hasBeenFlipped, setHasBeenFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchStartedRef = useRef(false);

  useEffect(() => {
    const fetchSongs = async () => {
      // Prevent multiple fetches in development due to strict mode
      if (fetchStartedRef.current) return;
      fetchStartedRef.current = true;

      try {
        const minYear = searchParams.get('minYear');
        const maxYear = searchParams.get('maxYear');
        const songList = searchParams.get('songList');

        console.log('Quiz parameters:', { minYear, maxYear, songList });

        if (!songList) {
          setError('No song list provided');
          setLoading(false);
          return;
        }

        let parsedSongs: Song[] = [];

        // Check if the songList is a Spotify playlist URL
        if (songList.includes('spotify.com/playlist')) {
          console.log('Fetching songs from Spotify playlist');
          const response = await fetch(`/api/spotify-playlist?url=${encodeURIComponent(songList)}`);
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch Spotify playlist');
          }
          const data = await response.json();
          if (!data || data.length === 0) {
            throw new Error('No songs found in the playlist');
          }
          console.log(`Received ${data.length} songs from Spotify playlist`);
          parsedSongs = data.map((song: any) => ({
            title: song.title,
            artist: song.artist,
            releaseYear: song.releaseYear,
            year: parseInt(song.releaseYear),
            spotifyUrl: undefined
          }));
        } else {
          console.log('Fetching songs from CSV file');
          const response = await fetch(songList);
          const csvText = await response.text();
          
          // Helper function to parse CSV line with quotes
          const parseCSVLine = (line: string) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
              } else {
                current += char;
              }
            }
            result.push(current);
            return result.map(field => field.replace(/^"|"$/g, '').trim());
          };
          
          // Parse CSV
          parsedSongs = csvText
            .split('\n')
            .slice(1) // Skip header
            .map(line => {
              const [title, artist, releaseYear] = parseCSVLine(line);
              const year = parseInt(releaseYear);
              return { artist, title, releaseYear, year, spotifyUrl: undefined };
            });
          console.log(`Parsed ${parsedSongs.length} songs from CSV`);
        }

        // Get the year range
        const minYearInt = parseInt(minYear!);
        const maxYearInt = parseInt(maxYear!);
        
        console.log('Filtering songs by year range:', { minYearInt, maxYearInt });
        
        // Create a map to store one song per year
        const selectedSongsByYear = new Map();
        
        // Select one random song for each year in the range
        for (let year = minYearInt; year <= maxYearInt; year++) {
          const songsForYear = parsedSongs.filter(song => song.year === year);
          if (songsForYear.length > 0) {
            const randomIndex = Math.floor(Math.random() * songsForYear.length);
            selectedSongsByYear.set(year, songsForYear[randomIndex]);
          }
        }

        // Convert map to array and shuffle
        const selectedSongs = Array.from(selectedSongsByYear.values())
          .sort(() => Math.random() - 0.5);

        console.log(`Selected ${selectedSongs.length} songs for the quiz`);

        // Set initial songs state and stop loading
        setSongs(selectedSongs);
        setLoading(false);

        // Keep track of songs we've already searched for
        const searchedSongs = new Map();

        // Fetch Spotify URLs in the background, one at a time
        const fetchSpotifyUrls = async () => {
          console.log('Starting to fetch Spotify URLs for songs');
          for (const song of selectedSongs) {
            try {
              const songKey = `${song.artist}-${song.title}`;
              
              // Skip if we've already searched for this song
              if (searchedSongs.has(songKey)) {
                console.log(`Skipping duplicate search for: ${songKey}`);
                continue;
              }
              
              searchedSongs.set(songKey, true);
              console.log(`Searching Spotify for: ${songKey}`);
              const trackId = await searchSpotifyTrack(song.artist, song.title);
              
              if (trackId) {
                console.log(`Found Spotify track ID for: ${songKey}`);
                setSongs(prevSongs => prevSongs.map(s => 
                  s === song ? { ...s, spotifyUrl: `https://open.spotify.com/track/${trackId}` } : s
                ));
              } else {
                console.log(`No Spotify track found for: ${songKey}`);
              }
            } catch (error) {
              console.error(`Error fetching Spotify URL for song: ${song.title}`, error);
            }
            // Small delay between requests to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 333));
          }
          console.log('Finished fetching Spotify URLs');
        };

        // Start fetching Spotify URLs without waiting
        fetchSpotifyUrls();

      } catch (error) {
        console.error('Error loading songs:', error);
        setError(error instanceof Error ? error.message : 'Failed to load songs');
        setLoading(false);
      }
    };

    fetchSongs();
  }, [searchParams]);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    setHasBeenFlipped(true);
  };

  const handleNextSong = () => {
    if (currentSongIndex < songs.length - 1) {
      // Mark current song as completed if it has been flipped at any point
      if (hasBeenFlipped) {
        setSongs(prevSongs => prevSongs.map((song, index) => 
          index === currentSongIndex ? { ...song, completed: true } : song
        ));
      }
      setCurrentSongIndex(prev => prev + 1);
      setIsFlipped(false);
      setHasBeenFlipped(false);
    }
  };

  const handlePreviousSong = () => {
    if (currentSongIndex > 0) {
      setCurrentSongIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-500 to-purple-600">
        <div className="bg-white p-8 rounded-2xl shadow-2xl">
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
            <div className="text-2xl font-semibold text-gray-700">Loading quiz...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-500 to-purple-600 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Oops! Something went wrong</h2>
            <p className="text-gray-600">{error}</p>
            <p className="text-sm text-gray-500">Please check if the playlist URL is correct and try again.</p>
          </div>
          
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 px-6 text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
          >
            Back to Start
          </button>
        </div>
      </div>
    );
  }

  const currentSong = songs[currentSongIndex];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-600 via-blue-500 to-purple-600 p-4">
      {/* Top section with back button */}
      <div className="w-full max-w-md mx-auto">
        <button
          onClick={() => router.push('/')}
          className="mb-5 px-6 py-2 bg-white text-purple-600 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 w-full"
        >
          Back to Start
        </button>
      </div>

      {/* Main card section */}
      <div className="w-full max-w-md mx-auto mb-4">
        <div className="perspective-1000 w-full">
          <div
            className={`relative w-full aspect-[3/2] transition-all duration-700 transform-gpu preserve-3d ${
              isFlipped ? 'rotate-y-180' : ''
            }`}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* Front of card */}
            <div
              className={`absolute inset-0 w-full h-full bg-white rounded-2xl shadow-2xl p-4 backface-hidden ${
                isFlipped ? 'invisible' : ''
              }`}
              onClick={handleFlip}
            >
              <div className="h-full flex flex-col items-center justify-between">
                <h2 className="text-xl font-bold text-center bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
                  Song #{currentSongIndex + 1}
                </h2>
                
                <a
                  href={currentSong.spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(`${currentSong.title} ${currentSong.artist}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-20 h-20 mx-auto transform hover:scale-110 transition-transform duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src="/spotify_logo.png"
                    alt="Search on Spotify"
                    className="w-full h-full object-contain filter drop-shadow-lg"
                  />
                </a>

                <div className="w-full flex justify-between items-center">
                  <div></div>
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => setIsFlipped(true)}
                      className="p-2 text-purple-600 hover:text-purple-800 transition-colors duration-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                      </svg>
                    </button>
                    <span className="text-xs text-gray-600">Flip card</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Back of card */}
            <div
              className={`absolute inset-0 w-full h-full bg-white rounded-2xl shadow-2xl p-4 backface-hidden rotate-y-180 ${
                !isFlipped ? 'invisible' : ''
              }`}
              onClick={handleFlip}
            >
              <div className="h-full flex flex-col items-center justify-between">
                <div className="flex-1 flex flex-col items-center justify-center space-y-3">
                  <p className="text-2xl font-bold text-center bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
                    {currentSong.releaseYear}
                  </p>
                  <p className="text-lg text-gray-800">{currentSong.artist}</p>
                  <h3 className="text-base text-gray-600">{currentSong.title}</h3>
                </div>

                <div className="w-full flex justify-end">
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => setIsFlipped(false)}
                      className="p-2 text-purple-600 hover:text-purple-800 transition-colors duration-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                      </svg>
                    </button>
                    <span className="text-xs text-gray-600">Flip card</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={handlePreviousSong}
            disabled={currentSongIndex === 0}
            className="px-6 py-2 bg-white text-purple-600 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl transform hover:scale-105 transition-all duration-200"
          >
            Previous
          </button>
          <button
            onClick={handleNextSong}
            disabled={currentSongIndex === songs.length - 1}
            className="px-6 py-2 bg-white text-purple-600 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl transform hover:scale-105 transition-all duration-200"
          >
            Next
          </button>
        </div>
      </div>

      {/* Completed cards section */}
      <div className="w-full max-w-4xl mx-auto mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {songs
            .filter(song => song.completed)
            .sort((a, b) => a.year - b.year)
            .map((song, index) => (
              <div key={index} className="bg-white rounded-lg shadow-md p-3 text-center">
                <p className="text-sm font-bold text-purple-600">{song.releaseYear}</p>
                <p className="text-xs text-gray-800 truncate mt-1">{song.artist}</p>
                <h4 className="text-xs text-gray-600 truncate">{song.title}</h4>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
} 