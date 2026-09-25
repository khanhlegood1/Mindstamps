import { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAPBOX_STYLE } from '../../config/mapbox';

mapboxgl.accessToken = MAPBOX_TOKEN;

const ROUTE_SOURCE_ID = 'guess-route';
const ROUTE_LAYER_ID = 'guess-route-line';

const createMarkerEl = (color) => {
  const el = document.createElement('div');
  el.style.width = '25px';
  el.style.height = '25px';
  el.style.borderRadius = '50% 50% 50% 0';
  el.style.transform = 'rotate(-45deg)';
  el.style.background = color;
  el.style.border = '2px solid white';
  el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)';
  return el;
};

const GuessMap = ({
  onGuess,
  guessPosition = null,
  actualPosition = null,
  showResult = false,
  disabled = false,
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const guessMarkerRef = useRef(null);
  const actualMarkerRef = useRef(null);
  const onGuessRef = useRef(onGuess);
  const disabledRef = useRef(disabled);

  onGuessRef.current = onGuess;
  disabledRef.current = disabled;

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: [0, 20], // [lng, lat]
      zoom: 1,
      attributionControl: true,
    });
    mapRef.current = map;

    map.on('click', (e) => {
      if (!disabledRef.current && onGuessRef.current) {
        onGuessRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Guess marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (guessMarkerRef.current) {
      guessMarkerRef.current.remove();
      guessMarkerRef.current = null;
    }

    if (guessPosition) {
      guessMarkerRef.current = new mapboxgl.Marker({ element: createMarkerEl('#2563eb') })
        .setLngLat([guessPosition.lng, guessPosition.lat])
        .addTo(map);
    }
  }, [guessPosition]);

  // Actual marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (actualMarkerRef.current) {
      actualMarkerRef.current.remove();
      actualMarkerRef.current = null;
    }

    if (showResult && actualPosition) {
      actualMarkerRef.current = new mapboxgl.Marker({ element: createMarkerEl('#dc2626') })
        .setLngLat([actualPosition.lng, actualPosition.lat])
        .addTo(map);
    }
  }, [showResult, actualPosition]);

  // Route line + fit bounds when result is shown
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const drawRoute = () => {
      const existingSource = map.getSource(ROUTE_SOURCE_ID);

      if (showResult && guessPosition && actualPosition) {
        const geojson = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [guessPosition.lng, guessPosition.lat],
              [actualPosition.lng, actualPosition.lat],
            ],
          },
        };

        if (existingSource) {
          existingSource.setData(geojson);
        } else {
          map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: geojson });
          map.addLayer({
            id: ROUTE_LAYER_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            paint: {
              'line-color': '#dc2626',
              'line-width': 3,
              'line-opacity': 0.7,
              'line-dasharray': [2, 2],
            },
          });
        }

        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([guessPosition.lng, guessPosition.lat]);
        bounds.extend([actualPosition.lng, actualPosition.lat]);
        map.fitBounds(bounds, { padding: 50, animate: true, duration: 500 });
      } else if (existingSource) {
        if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
        map.removeSource(ROUTE_SOURCE_ID);
      }
    };

    if (map.isStyleLoaded()) {
      drawRoute();
    } else {
      map.once('load', drawRoute);
    }
  }, [showResult, guessPosition, actualPosition]);

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border border-gray-300">
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
};

export default GuessMap;
