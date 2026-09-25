import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAPBOX_STYLE } from '../config/mapbox';

mapboxgl.accessToken = MAPBOX_TOKEN;

const GEOCODING_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

const reverseGeocode = (lat, lng, callback) => {
  const url = `${GEOCODING_BASE}/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const name = data?.features?.[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      callback({ lat, lng, name });
    })
    .catch(() => {
      callback({ lat, lng, name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
    });
};

// Small map used inside a memory page: read-only when viewing,
// click-to-move-marker when editable so the location can be changed.
const MemoryLocationMap = ({ location, editable = false, onLocationChange, height = '11rem' }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const editableRef = useRef(editable);
  const onLocationChangeRef = useRef(onLocationChange);

  editableRef.current = editable;
  onLocationChangeRef.current = onLocationChange;

  // Initialize the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return undefined;

    const start = location ? [location.lng, location.lat] : [0, 20];
    const zoom = location ? 12 : 1;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: start,
      zoom,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    if (location) {
      markerRef.current = new mapboxgl.Marker({ color: '#b45309' })
        .setLngLat([location.lng, location.lat])
        .addTo(map);
    }

    map.on('click', (e) => {
      if (!editableRef.current) return;
      const { lat, lng } = e.lngLat;
      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        markerRef.current = new mapboxgl.Marker({ color: '#b45309' }).setLngLat([lng, lat]).addTo(map);
      }
      if (onLocationChangeRef.current) {
        reverseGeocode(lat, lng, onLocationChangeRef.current);
      }
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker/center in sync when the location changes from outside
  // (switching to a different memory, or picking a new point while editing)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (location) {
      if (markerRef.current) {
        markerRef.current.setLngLat([location.lng, location.lat]);
      } else {
        markerRef.current = new mapboxgl.Marker({ color: '#b45309' })
          .setLngLat([location.lng, location.lat])
          .addTo(map);
      }
      map.flyTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 10), duration: 400 });
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [location?.lat, location?.lng]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className="rounded-lg border flex items-center justify-center text-xs text-center p-2"
        style={{ height, borderColor: 'var(--soft-beige)', color: 'var(--warm-brown)' }}
      >
        Map unavailable
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border relative" style={{ height, borderColor: 'var(--soft-beige)' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {editable && (
        <div
          className="absolute inset-x-0 bottom-0 text-[11px] text-center py-1"
          style={{ background: 'rgba(255,255,255,0.85)', color: 'var(--warm-brown)' }}
        >
          {location ? 'Tap the map to move the pin' : 'Tap the map to set a location'}
        </div>
      )}
    </div>
  );
};

export default MemoryLocationMap;
