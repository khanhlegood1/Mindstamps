import { useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAPBOX_STYLE } from '../../config/mapbox';

mapboxgl.accessToken = MAPBOX_TOKEN;

const GEOCODING_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

const LocationPicker = ({ onLocationSelect, initialLocation = null }) => {
  const [position, setPosition] = useState(
    initialLocation ? [initialLocation.lat, initialLocation.lng] : null
  );
  const [locationName, setLocationName] = useState(initialLocation?.name || '');
  const [addressSearch, setAddressSearch] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const reverseGeocode = (lat, lng) => {
    const url = `${GEOCODING_BASE}/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const name = data?.features?.[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        setLocationName(name);
      })
      .catch(() => {
        setLocationName(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      });
  };

  const placeMarker = (lat, lng, map) => {
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      markerRef.current = new mapboxgl.Marker({ color: '#2563eb' })
        .setLngLat([lng, lat])
        .addTo(map);
    }
  };

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const startCenter = position ? [position[1], position[0]] : [-74.006, 40.7128]; // NYC default
    const startZoom = position ? 13 : 1;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: startCenter,
      zoom: startZoom,
    });
    mapRef.current = map;

    if (position) {
      map.once('load', () => placeMarker(position[0], position[1], map));
    }

    map.on('click', (e) => {
      const { lat, lng } = e.lngLat;
      setPosition([lat, lng]);
      placeMarker(lat, lng, map);
      reverseGeocode(lat, lng);
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

  // Notify parent when position/name changes
  useEffect(() => {
    if (position && locationName && onLocationSelect) {
      onLocationSelect({
        lat: position[0],
        lng: position[1],
        name: locationName,
      });
    }
  }, [position, locationName, onLocationSelect]);

  const searchAddress = async () => {
    if (!addressSearch.trim()) {
      alert('Please enter an address to search');
      return;
    }

    setSearchLoading(true);
    try {
      const url = `${GEOCODING_BASE}/${encodeURIComponent(addressSearch)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
      const response = await fetch(url);
      const data = await response.json();

      if (data?.features?.length > 0) {
        const result = data.features[0];
        const [lng, lat] = result.center;

        setPosition([lat, lng]);
        setLocationName(result.place_name);

        const map = mapRef.current;
        if (map) {
          placeMarker(lat, lng, map);
          map.flyTo({ center: [lng, lat], zoom: 15, animate: true, duration: 800 });
        }
      } else {
        alert('Address not found. Please try a different search term.');
      }
    } catch (error) {
      console.error('Error searching address:', error);
      alert('Error searching address. Please try again.');
    }
    setSearchLoading(false);
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchAddress();
    }
  };

  return (
    <div className="space-y-4">
      {/* Address Search */}
      <div className="flex gap-2">
        <input
          type="text"
          value={addressSearch}
          onChange={(e) => setAddressSearch(e.target.value)}
          onKeyPress={handleSearchKeyPress}
          placeholder="Enter an address (e.g., 123 Main St, New York, NY)"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={searchAddress}
          disabled={searchLoading}
          className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {searchLoading ? '...' : 'Search'}
        </button>
      </div>

      <div
        className="w-full rounded-lg overflow-hidden border border-gray-300"
        style={{ height: 'clamp(260px, 45dvh, 340px)' }}
      >
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      </div>

      {position && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600 mb-2">Selected Location:</div>
          <div className="font-medium">{locationName}</div>
          <div className="text-sm text-gray-500">
            Coordinates: {position[0].toFixed(6)}, {position[1].toFixed(6)}
          </div>
        </div>
      )}

      <div className="text-sm text-gray-600">
        💡 Tap or click anywhere on the map to select a location
      </div>
    </div>
  );
};

export default LocationPicker;
