'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { predefinedPlaylists } from './config/playlists';

export default function Home() {
  const router = useRouter();
  const [minYear, setMinYear] = useState('');
  const [maxYear, setMaxYear] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState('');
  const [customPlaylistUrl, setCustomPlaylistUrl] = useState('');
  const [useCustomUrl, setUseCustomUrl] = useState(false);

  const currentYear = new Date().getFullYear();

  const isFormValid = () => {
    if (!minYear || !maxYear) return false;
    if (parseInt(minYear) > parseInt(maxYear)) return false;
    if (parseInt(minYear) < 1900 || parseInt(maxYear) > currentYear) return false;
    
    if (useCustomUrl) {
      if (!customPlaylistUrl) return false;
      const spotifyPlaylistRegex = /^https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/;
      return spotifyPlaylistRegex.test(customPlaylistUrl);
    } else {
      return selectedPlaylist !== '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;

    const songList = useCustomUrl ? customPlaylistUrl : predefinedPlaylists.find(p => p.id === selectedPlaylist)?.url;
    if (!songList) return;

    router.push(`/quiz?minYear=${minYear}&maxYear=${maxYear}&songList=${encodeURIComponent(songList)}`);
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
              <label htmlFor="minYear" className="block text-sm font-medium text-gray-700 mb-1">
                From Year
              </label>
              <input
                type="number"
                id="minYear"
                value={minYear}
                onChange={(e) => setMinYear(e.target.value)}
                min="1900"
                max={currentYear}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="1900"
              />
            </div>
            <div>
              <label htmlFor="maxYear" className="block text-sm font-medium text-gray-700 mb-1">
                To Year
              </label>
              <input
                type="number"
                id="maxYear"
                value={maxYear}
                onChange={(e) => setMaxYear(e.target.value)}
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
                  checked={!useCustomUrl}
                  onChange={() => setUseCustomUrl(false)}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <span className="ml-2 text-gray-700">Choose playlist</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={useCustomUrl}
                  onChange={() => setUseCustomUrl(true)}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <span className="ml-2 text-gray-700">Enter playlist URL</span>
              </label>
            </div>

            {!useCustomUrl ? (
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
                  <p className="mt-1 text-sm text-gray-500">
                    {predefinedPlaylists.find(p => p.id === selectedPlaylist)?.description}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label htmlFor="playlistUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  Spotify Playlist URL
                </label>
                <input
                  type="text"
                  id="playlistUrl"
                  value={customPlaylistUrl}
                  onChange={(e) => setCustomPlaylistUrl(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Enter a public Spotify playlist URL
                </p>
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