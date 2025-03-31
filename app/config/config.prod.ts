// Production configuration using environment variables

export const prodConfig = {
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  },
  discogs: {
    apiKey: process.env.DISCOGS_API_KEY,
  },
  // Add other environment variables as needed
}; 