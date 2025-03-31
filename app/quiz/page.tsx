'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { searchSpotifyTrack } from '../utils/spotify';

interface Song {
  artist: string;
  title: string;
  releaseYear: string;
  releaseMonth: string;
  releaseDay: string;
  currentReleaseDate: string;
  spotifyUrl: string | undefined;
  completed?: boolean;
  source?: string;
  sourceUrl?: string;
}

interface PlaylistResponse {
  songs: Song[];
  total: number;
  hasMore: boolean;
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalSongs, setTotalSongs] = useState(0);
  const [completedSongs, setCompletedSongs] = useState<Song[]>([]);
  const fetchStartedRef = useRef(false);

  const loadMoreSongs = async (startIndex: number) => {
    try {
      setIsLoadingMore(true);
      const songList = searchParams.get('songList');
      if (!songList) {
        throw new Error('No song list provided');
      }

      // Only use pagination for Spotify playlists
      if (songList.includes('spotify.com/playlist')) {
        const response = await fetch(`/api/spotify-playlist?url=${encodeURIComponent(songList)}&startIndex=${startIndex}&limit=5`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch Spotify playlist');
        }
        const data: PlaylistResponse = await response.json();
        setSongs(prevSongs => [...prevSongs, ...data.songs]);
        setTotalSongs(data.total);
      } else {
        // For CSV files, load everything at once
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
        const parsedSongs = csvText
          .split('\n')
          .slice(1) // Skip header
          .map(line => {
            const [title, artist, releaseYear] = parseCSVLine(line);
            return {
              artist,
              title,
              releaseYear,
              releaseMonth: 'N/A',
              releaseDay: 'N/A',
              currentReleaseDate: releaseYear,
              spotifyUrl: undefined,
              source: undefined,
              sourceUrl: undefined
            };
          });
        
        setSongs(parsedSongs);
        setTotalSongs(parsedSongs.length);
      }
      
      // If this is the first load, also set up the quiz
      if (startIndex === 0) {
        setCurrentSongIndex(0);
        setCompletedSongs([]);
        setIsFlipped(false);
        setHasBeenFlipped(false);
      }
    } catch (error) {
      console.error('Error loading songs:', error);
      setError('Failed to load songs. Please try again.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    const fetchSongs = async () => {
      if (fetchStartedRef.current) return;
      fetchStartedRef.current = true;

      try {
        await loadMoreSongs(0);
      } catch (error) {
        console.error('Error loading songs:', error);
        setError('Failed to load songs. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    const songList = searchParams.get('songList');
    if (songList) {
      fetchSongs();
    }
  }, [searchParams]);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    setHasBeenFlipped(true);
  };

  const handleNextSong = () => {
    if (currentSongIndex < songs.length - 1) {
      // Mark current song as completed if it has been flipped at any point
      if (hasBeenFlipped) {
        setCompletedSongs(prev => [...prev, songs[currentSongIndex]]);
      }
      setCurrentSongIndex(prev => prev + 1);
      setIsFlipped(false);
      setHasBeenFlipped(false);
      
      // If we're getting close to the end of our loaded songs, load more
      const songList = searchParams.get('songList');
      if (songList?.includes('spotify.com/playlist') && 
          currentSongIndex >= songs.length - 3 && 
          songs.length < totalSongs) {
        loadMoreSongs(songs.length);
      }
    }
  };

  const handlePreviousSong = () => {
    if (currentSongIndex > 0) {
      setCurrentSongIndex(prev => prev - 1);
      setIsFlipped(false);
      setHasBeenFlipped(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-500 to-purple-600 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto text-purple-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-full h-full animate-spin">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Loading quiz...</h2>
            {isLoadingMore && (
              <p className="text-gray-600">Loading more songs...</p>
            )}
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
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 px-6 text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              Back to Start
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!songs.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-500 to-purple-600 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">No songs found</h2>
            <p className="text-gray-600">Please check your playlist and try again.</p>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 px-6 text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              Back to Start
            </button>
          </div>
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
            {/* Back of card */}
            <div
              className={`absolute inset-0 w-full h-full bg-white rounded-2xl shadow-2xl p-4 backface-hidden rotate-y-180 ${
                !isFlipped ? 'invisible' : ''
              }`}
            >
              <div className="h-full flex flex-col items-center justify-between">
                <div className="flex-1 flex flex-col items-center justify-center w-full">
                  {/* Release information section */}
                  <div className="text-center mb-2">
                    <div className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
                      {currentSong?.releaseYear}
                    </div>
                    <div className="mt-1 text-gray-600 leading-tight">
                      <div className="text-lg">Month: {currentSong?.releaseMonth || 'N/A'}</div>
                      <div className="text-lg">Day: {currentSong?.releaseDay === '0' ? 'N/A' : (currentSong?.releaseDay || 'N/A')}</div>
                    </div>
                  </div>

                  {/* Artist and title section */}
                  <div className="border-t border-gray-200 w-full max-w-[85%] pt-3 text-center">
                    <p className="text-xl font-semibold text-gray-800 break-words">{currentSong?.artist}</p>
                    <h3 className="text-lg text-gray-600 mt-1 break-words">{currentSong?.title}</h3>
                  </div>

                  {/* Source information */}
                  <div className="text-sm text-gray-500 mt-3">
                    Data from{' '}
                    {currentSong?.source && (
                      <a href={currentSong.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        {currentSong.source}
                      </a>
                    )}
                  </div>
                </div>

                <div className="absolute bottom-4 right-4 flex flex-col items-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFlipped(false);
                      setHasBeenFlipped(true);
                    }}
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

            {/* Front of card */}
            <div
              className={`absolute inset-0 w-full h-full bg-white rounded-2xl shadow-2xl p-4 backface-hidden ${
                isFlipped ? 'invisible' : ''
              }`}
            >
              <div className="h-full flex flex-col items-center justify-between">
                <h2 className="text-xl font-bold text-center bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
                  Song #{currentSongIndex + 1}
                </h2>
                
                {currentSong && (
                  <a
                    href={currentSong.spotifyUrl}
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
                )}

                <div className="w-full flex justify-between items-center">
                  <div></div>
                  <div className="flex flex-col items-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsFlipped(true);
                        setHasBeenFlipped(true);
                      }}
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
          {completedSongs
            .sort((a, b) => parseInt(a.releaseYear) - parseInt(b.releaseYear))
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