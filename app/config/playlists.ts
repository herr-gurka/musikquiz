export interface Playlist {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export const predefinedPlaylists = [
  {
    id: 'one-song',
    name: 'One song',
    url: 'https://open.spotify.com/playlist/61d65P9G7Vs04feYIvamzD',
    description: 'A playlist with just one song for quick testing'
  },
  {
    id: 'three-songs',
    name: 'Three songs',
    url: 'https://open.spotify.com/playlist/69ZX2UbB8zKfrkFT8Hb5NE',
    description: 'A playlist with three songs for testing'
  },
  {
    id: 'five-songs',
    name: 'Five songs',
    url: 'https://open.spotify.com/playlist/70WKDDjnek5evVwcc4ze80',
    description: 'A playlist with five songs for testing'
  }
]; 