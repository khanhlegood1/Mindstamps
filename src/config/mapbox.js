// Mapbox configuration
// Set VITE_MAPBOX_TOKEN in your .env file (see .env.example).
// Get a free token at https://account.mapbox.com/access-tokens/
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Default Mapbox style used across the app's maps.
export const MAPBOX_STYLE = import.meta.env.VITE_MAPBOX_STYLE || 'mapbox://styles/mapbox/streets-v12';

if (!MAPBOX_TOKEN && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[mapbox] VITE_MAPBOX_TOKEN is not set. Maps will not load. Add it to your .env file.'
  );
}
