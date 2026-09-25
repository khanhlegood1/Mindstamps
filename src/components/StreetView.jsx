import { GOOGLE_MAPS_API_KEY } from '../config/googleMaps';

// Embeds a live Google Street View panorama for a lat/lng, used as an
// alternative to an uploaded photo when the "Street View" imagery option
// is chosen while creating or editing a memory.
const StreetView = ({ lat, lng, heading = 0, pitch = 0, height = '100%', className = '' }) => {
  const hasLocation = typeof lat === 'number' && typeof lng === 'number';

  if (!GOOGLE_MAPS_API_KEY || !hasLocation) {
    return (
      <div
        className={`rounded-lg border flex items-center justify-center text-xs text-center p-3 ${className}`}
        style={{ height, borderColor: 'var(--soft-beige)', color: 'var(--warm-brown)' }}
      >
        {hasLocation ? 'Street View unavailable' : 'Pin a location to preview Street View'}
      </div>
    );
  }

  const src = `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=90`;

  return (
    <div className={`rounded-lg overflow-hidden border ${className}`} style={{ height, borderColor: 'var(--soft-beige)' }}>
      <iframe
        title="Street View"
        src={src}
        width="100%"
        height="100%"
        style={{ border: 0, display: 'block' }}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
};

export default StreetView;
