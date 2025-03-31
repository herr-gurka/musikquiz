import { prodConfig } from './config.prod';

// Try to import local config, but don't fail if it doesn't exist
let localConfig;
try {
  localConfig = require('./config.local').localConfig;
} catch (e) {
  // If local config doesn't exist, use production config
  localConfig = prodConfig;
}

// Determine if we're in development or production
const isDevelopment = process.env.NODE_ENV === 'development';

// Export the appropriate configuration
export const config = isDevelopment ? localConfig : prodConfig; 