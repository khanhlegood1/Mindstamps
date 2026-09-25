// Google Maps configuration — only used for embedding Street View imagery.
// Get a key at https://console.cloud.google.com/google/maps-apis and enable
// the "Maps Embed API" (free, no billing required for normal usage).
// Set VITE_GOOGLE_MAPS_API_KEY in your .env file (see .env.example).
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

if (!GOOGLE_MAPS_API_KEY && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[googleMaps] VITE_GOOGLE_MAPS_API_KEY is not set. Street View imagery will not load. Add it to your .env file.'
  );
}
