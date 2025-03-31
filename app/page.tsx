'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { predefinedPlaylists } from './config/playlists';

interface Song {
  title: string;
  artist: string;
  releaseYear: string;
  currentReleaseDate: string;
  spotifyUrl?: string;
  source: 'wikipedia' | 'musicbrainz' | 'spotify';
  wikipediaSearch: {
    date: string | null;
    source: string;
  };
  musicbrainzSearch: {
    originalTitle: string;
    cleanedTitle: string;
    originalArtist: string;
    cleanedArtist: string;
    searchQuery: string;
    foundDate: string;
  };
}

export default function Home() {
  const router = useRouter();
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [startYear, setStartYear] = useState('1900');
  const [endYear, setEndYear] = useState('2025');
  const [selectedPlaylist, setSelectedPlaylist] = useState('');
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPlaylistForm, setShowPlaylistForm] = useState(true);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedSource, setSelectedSource] = useState<'predefined' | 'custom'>('predefined');

  const currentYear = new Date().getFullYear();

  const defaultPlaylists = [
    {
      name: 'One song',
      url: 'https://open.spotify.com/playlist/61d65P9G7Vs04feYIvamzD'
    },
    {
      name: 'Three songs',
      url: 'https://open.spotify.com/playlist/69ZX2UbB8zKfrkFT8Hb5NE'
    },
    {
      name: 'Five songs',
      url: 'https://open.spotify.com/playlist/70WKDDjnek5evVwcc4ze80'
    }
  ];

  const isFormValid = () => {
    if (!startYear || !endYear) return false;
    if (parseInt(startYear) > parseInt(endYear)) return false;
    if (parseInt(startYear) < 1900 || parseInt(endYear) > currentYear) return false;
    
    if (selectedSource === 'custom') {
      if (!playlistUrl) return false;
      const spotifyPlaylistRegex = /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/;
      return spotifyPlaylistRegex.test(playlistUrl);
    } else {
      return selectedPlaylist !== '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;

    const songList = selectedSource === 'custom' ? playlistUrl : predefinedPlaylists.find(p => p.id === selectedPlaylist)?.url;
    if (!songList) return;

    router.push(`/quiz?minYear=${startYear}&maxYear=${endYear}&songList=${encodeURIComponent(songList)}`);
  };

  const fetchSongsFromSpotify = async (playlistUrl: string) => {
    try {
      console.log('Fetching songs from Spotify playlist');
      const response = await fetch(`/api/spotify-playlist?url=${encodeURIComponent(playlistUrl)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch songs from Spotify playlist');
      }
      const songs = await response.json();
      console.log('Received songs from Spotify playlist:', songs);
      
      // Log MusicBrainz search details for each song
      songs.forEach((song: any) => {
        if (song.musicbrainzSearch) {
          console.log('\n=== MusicBrainz Search Details ===');
          console.log('Song:', song.title);
          console.log('Original Title:', song.musicbrainzSearch.originalTitle);
          console.log('Cleaned Title:', song.musicbrainzSearch.cleanedTitle);
          console.log('Original Artist:', song.musicbrainzSearch.originalArtist);
          console.log('Cleaned Artist:', song.musicbrainzSearch.cleanedArtist);
          console.log('Search Query:', song.musicbrainzSearch.searchQuery);
          console.log('Found Date:', song.musicbrainzSearch.foundDate);
          console.log('Current Release Date:', song.currentReleaseDate);
          console.log('Final Release Year:', song.releaseYear);
        }
      });

      return songs;
    } catch (error) {
      console.error('Error fetching songs:', error);
      throw error;
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-500 to-purple-600 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <h1 className="text-3xl font-bold text-center bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
          Musikquiz
        </h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Year Range Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startYear" className="block text-sm font-medium text-gray-700 mb-1">
                From Year
              </label>
              <input
                type="number"
                id="startYear"
                value={startYear}
                onChange={(e) => setStartYear(e.target.value)}
                min="1900"
                max={currentYear}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="1900"
              />
            </div>
            <div>
              <label htmlFor="endYear" className="block text-sm font-medium text-gray-700 mb-1">
                To Year
              </label>
              <input
                type="number"
                id="endYear"
                value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
                min="1900"
                max={currentYear}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder={currentYear.toString()}
              />
            </div>
          </div>

          {/* Playlist Selection */}
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={selectedSource === 'predefined'}
                  onChange={() => setSelectedSource('predefined')}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <span className="ml-2 text-gray-700">Choose playlist</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={selectedSource === 'custom'}
                  onChange={() => setSelectedSource('custom')}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <span className="ml-2 text-gray-700">Enter playlist URL</span>
              </label>
            </div>

            {selectedSource === 'predefined' ? (
              <div>
                <label htmlFor="playlist" className="block text-sm font-medium text-gray-700 mb-1">
                  Select Playlist
                </label>
                <select
                  id="playlist"
                  value={selectedPlaylist}
                  onChange={(e) => setSelectedPlaylist(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">Select a playlist...</option>
                  {predefinedPlaylists.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.name}
                    </option>
                  ))}
                </select>
                {selectedPlaylist && (
                  <p className="mt-2 text-sm text-gray-600">
                    {predefinedPlaylists.find(p => p.id === selectedPlaylist)?.description}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label htmlFor="playlistUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  Custom Playlist URL
                </label>
                <input
                  type="text"
                  id="playlistUrl"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!isFormValid()}
            className={`w-full py-3 px-6 text-white font-semibold rounded-lg shadow-lg transform transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
              isFormValid()
                ? 'bg-gradient-to-r from-purple-600 to-blue-500 hover:shadow-xl hover:scale-[1.02]'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            Generate Quiz
          </button>
        </form>
      </div>
    </main>
  );
} 