export interface Playlist {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export const predefinedPlaylists: Playlist[] = [
  {
    id: 'hip-hop',
    name: 'Hip Hop',
    url: 'https://open.spotify.com/playlist/20KOFOgLR783Z3U9z9nLWe',
    description: 'A collection of classic hip hop tracks'
  },
  {
    id: 'mix',
    name: 'Mix',
    url: 'https://open.spotify.com/playlist/4zPrx4mWG5QB61zH8bbva7',
    description: 'A diverse mix of classic songs'
  }
]; 