'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_LIST_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSUoGB4mnijJGf2Uaq9wLR5mDg5COHwcQnwlvnknS2nmAEa76p_xmGBJOsZNN1JsivwGO3DYuXnUqeQ/pub?output=csv';
const DEFAULT_LIST_VIEW_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSUoGB4mnijJGf2Uaq9wLR5mDg5COHwcQnwlvnknS2nmAEa76p_xmGBJOsZNN1JsivwGO3DYuXnUqeQ/pubhtml';

interface YearRange {
  minYear: number;
  maxYear: number;
}

export default function Home() {
  const router = useRouter();
  const [minYear, setMinYear] = useState<string>('');
  const [maxYear, setMaxYear] = useState<string>('');
  const [yearRange, setYearRange] = useState<YearRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [playlistUrl, setPlaylistUrl] = useState<string>('');
  const [useDefaultList, setUseDefaultList] = useState(true);

  useEffect(() => {
    const fetchYearRange = async () => {
      try {
        const response = await fetch(DEFAULT_LIST_URL);
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
        
        // Parse CSV to get years
        const years = csvText
          .split('\n')
          .slice(1) // Skip header
          .map(line => {
            const [title, artist, releaseYear] = parseCSVLine(line);
            const year = parseInt(releaseYear);
            console.log('Parsed year:', year, 'from line:', line); // Debug log
            return year;
          })
          .filter(year => !isNaN(year));

        console.log('All parsed years:', years); // Debug log
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        console.log('Min year:', minYear, 'Max year:', maxYear); // Debug log

        setYearRange({ minYear, maxYear });
        setMinYear(minYear.toString());
        setMaxYear(maxYear.toString());
        setLoading(false);
      } catch (error) {
        console.error('Error fetching year range:', error);
        setLoading(false);
      }
    };

    fetchYearRange();
  }, []);

  const isValidYear = (year: string) => {
    if (!yearRange) return false;
    const num = parseInt(year);
    return !isNaN(num) && num >= yearRange.minYear && num <= yearRange.maxYear;
  };

  const isFormValid = () => {
    const yearValidation = isValidYear(minYear) && 
                          isValidYear(maxYear) && 
                          parseInt(minYear) <= parseInt(maxYear);
    
    if (useDefaultList) {
      return yearValidation;
    } else {
      return yearValidation && playlistUrl.trim() !== '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;

    const queryParams = new URLSearchParams({
      minYear: minYear,
      maxYear: maxYear,
      songList: useDefaultList ? DEFAULT_LIST_URL : playlistUrl
    });
    router.push(`/quiz?${queryParams.toString()}`);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'min' | 'max') => {
    const value = e.target.value;
    if (type === 'min') {
      setMinYear(value);
    } else {
      setMaxYear(value);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-500 to-purple-600">
        <div className="bg-white p-8 rounded-2xl shadow-2xl">
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
            <div className="text-2xl font-semibold text-gray-700">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-500 to-purple-600 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
            Music Quiz Generator
          </h1>
          <p className="text-gray-600">Test your music knowledge across different eras</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="block text-lg font-semibold text-gray-700">Year Range</label>
              
              {/* Number Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">From</label>
                  <input
                    type="number"
                    placeholder={yearRange?.minYear.toString()}
                    value={minYear}
                    onChange={(e) => handleYearChange(e, 'min')}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 ${
                      minYear && !isValidYear(minYear) ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {minYear && !isValidYear(minYear) && (
                    <p className="mt-1 text-xs text-red-500">Enter a year between {yearRange?.minYear} and {yearRange?.maxYear}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">To</label>
                  <input
                    type="number"
                    placeholder={yearRange?.maxYear.toString()}
                    value={maxYear}
                    onChange={(e) => handleYearChange(e, 'max')}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 ${
                      maxYear && !isValidYear(maxYear) ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {maxYear && !isValidYear(maxYear) && (
                    <p className="mt-1 text-xs text-red-500">Enter a year between {yearRange?.minYear} and {yearRange?.maxYear}</p>
                  )}
                </div>
              </div>
              {isValidYear(minYear) && isValidYear(maxYear) && parseInt(minYear) > parseInt(maxYear) && (
                <p className="text-xs text-red-500">End year must be greater than or equal to start year</p>
              )}
            </div>

            {/* Song List Selection */}
            <div className="space-y-4">
              <label className="block text-lg font-semibold text-gray-700">Song List</label>
              
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={useDefaultList}
                    onChange={() => setUseDefaultList(true)}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-gray-700">Use default song list</span>
                </label>
                
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={!useDefaultList}
                    onChange={() => setUseDefaultList(false)}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-gray-700">Use Spotify playlist</span>
                </label>
              </div>

              {!useDefaultList && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Spotify Playlist URL</label>
                  <input
                    type="text"
                    placeholder="https://open.spotify.com/playlist/..."
                    value={playlistUrl}
                    onChange={(e) => setPlaylistUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                  />
                </div>
              )}

              {useDefaultList && (
                <div className="text-center text-sm text-gray-600">
                  Using <a 
                    href={DEFAULT_LIST_VIEW_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-800 underline"
                  >
                    default song list
                  </a>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!isFormValid()}
            className="w-full py-3 px-6 text-white font-semibold bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-lg"
          >
            Generate Quiz
          </button>
        </form>
      </div>
    </div>
  );
} 