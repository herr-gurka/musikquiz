import { localConfig } from './config.local';
import { prodConfig } from './config.prod';

// Determine if we're in development or production
const isDevelopment = process.env.NODE_ENV === 'development';

// Export the appropriate configuration
export const config = isDevelopment ? localConfig : prodConfig; 