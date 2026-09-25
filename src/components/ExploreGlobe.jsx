import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { MAPBOX_TOKEN } from '../config/mapbox';

mapboxgl.accessToken = MAPBOX_TOKEN;

// A dark style shows off the star field / atmosphere fog nicely.
const GLOBE_STYLE = 'mapbox://styles/mapbox/dark-v11';

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));

const truncate = (text = '', max = 160) => {
  const clean = String(text).trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
};

// Every memory saved across all users, plotted on a rotating dark globe and
// grouped into clusters the way https://phoneme.vercel.app/explore does.
// Clicking a cluster zooms in; clicking a single point opens a small
// preview popup (photo, place, title, snippet of the story).
const ExploreGlobe = () => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | empty | error

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return undefined;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: GLOBE_STYLE,
      projection: 'globe',
      center: [10, 20],
      zoom: 1.1,
      attributionControl: false,
    });
    mapRef.current = map;

    map.scrollZoom.disable();
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('style.load', () => {
      map.setFog({
        color: 'rgb(30, 24, 50)',
        'high-color': 'rgb(56, 34, 90)',
        'horizon-blend': 0.03,
        'space-color': 'rgb(6, 6, 16)',
        'star-intensity': 0.5,
      });
    });

    popupRef.current = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '260px',
      offset: 14,
    });

    let isMounted = true;

    const addSourceAndLayers = (features) => {
      if (map.getSource('memories')) {
        map.getSource('memories').setData({ type: 'FeatureCollection', features });
        return;
      }

      map.addSource('memories', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 9,
      });

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'memories',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#7c3aed',
          'circle-opacity': 0.85,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26, 200, 32],
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'memories',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 13,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#ffffff' },
      });

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'memories',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#c4b5fd',
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#7c3aed',
        },
      });

      map.on('click', 'clusters', (e) => {
        const [feature] = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        if (!feature) return;
        const clusterId = feature.properties.cluster_id;
        map.getSource('memories').getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: feature.geometry.coordinates, zoom, duration: 500 });
        });
      });

      map.on('click', 'unclustered-point', (e) => {
        const feature = e.features && e.features[0];
        if (!feature) return;
        const { title, story, place, imageData } = feature.properties;
        const coordinates = feature.geometry.coordinates.slice();

        const imageHtml = imageData
          ? `<div style="width:100%;height:110px;border-radius:8px;overflow:hidden;margin-bottom:8px;"><img src="${imageData}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`
          : '';

        popupRef.current
          .setLngLat(coordinates)
          .setHTML(`
            <div style="font-family:inherit;color:#2d1b0e;max-width:230px;">
              ${imageHtml}
              ${place ? `<div style="font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#7c3aed;margin-bottom:2px;">${escapeHtml(place)}</div>` : ''}
              <div style="font-weight:600;font-size:15px;margin-bottom:4px;">${escapeHtml(title)}</div>
              ${story ? `<div style="font-size:13px;line-height:1.4;color:#57534e;">${escapeHtml(story)}</div>` : ''}
            </div>
          `)
          .addTo(map);
      });

      ['clusters', 'unclustered-point'].forEach((layerId) => {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      });
    };

    const loadMemories = async () => {
      try {
        const q = query(collection(db, 'memories'), orderBy('createdAt', 'desc'), limit(500));
        const snapshot = await getDocs(q);
        const features = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            const lat = data.location?.lat;
            const lng = data.location?.lng;
            if (typeof lat !== 'number' || typeof lng !== 'number') return null;
            return {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [lng, lat] },
              properties: {
                id: docSnap.id,
                title: data.title || 'A memory',
                story: truncate(data.story || ''),
                place: data.location?.name || '',
                imageData: data.imageData || null,
              },
            };
          })
          .filter(Boolean);

        if (!isMounted) return;

        if (features.length === 0) {
          setStatus('empty');
          return;
        }

        addSourceAndLayers(features);
        setStatus('ready');
      } catch (err) {
        console.error('Error loading memories for globe:', err);
        if (isMounted) setStatus('error');
      }
    };

    if (map.loaded()) {
      loadMemories();
    } else {
      map.once('load', loadMemories);
    }

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      isMounted = false;
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className="w-full h-full min-h-[16rem] rounded-2xl flex items-center justify-center text-sm text-center p-6"
        style={{ background: 'rgb(15,15,28)', color: 'rgba(255,255,255,0.5)' }}
      >
        Map unavailable
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[16rem] rounded-2xl overflow-hidden" style={{ background: 'rgb(6,6,16)' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {status === 'empty' && (
        <div
          className="absolute inset-x-0 bottom-3 text-center text-xs px-4"
          style={{ color: 'rgba(255,255,255,0.55)' }}
        >
          No memories saved yet — be the first!
        </div>
      )}
    </div>
  );
};

export default ExploreGlobe;
