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

interface QuizCardProps {
  song: Song;
  onAnswer: (year: number) => void;
  isAnswered: boolean;
  correctYear: number;
}

export default function QuizCard({ song, onAnswer, isAnswered, correctYear }: QuizCardProps) {
  const showVersionNote = song.currentReleaseDate && 
    song.currentReleaseDate !== song.releaseYear;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">{song.title}</h2>
      <p className="text-xl text-gray-600 mb-6">by {song.artist}</p>
      
      {!isAnswered ? (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            When was this song released?
          </label>
          <input
            type="number"
            min="1900"
            max={new Date().getFullYear()}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="Enter year"
            onChange={(e) => onAnswer(parseInt(e.target.value))}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-lg">
            The correct year is <span className="font-bold">{correctYear}</span>
          </p>
          {showVersionNote && (
            <p className="text-sm text-gray-500 italic">
              Note: This version was released in {song.currentReleaseDate}
            </p>
          )}
        </div>
      )}

      <div className="text-2xl font-bold text-white mb-2">
        {song.releaseYear.split('-')[0]}
        <span className="ml-2 text-sm font-normal text-gray-300">
          (Source: {song.source})
        </span>
      </div>
    </div>
  );
} 