import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { MAPBOX_TOKEN } from '../config/mapbox';
import LearningGameLibrary from './LearningGameLibrary';
import { normalizeGameVersions } from '../lib/learningGame';
import { buildGlobeFeature } from '../lib/globeMemories';

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

// Every memory saved across all users, plotted on a rotating dark globe and
// grouped into clusters the way https://phoneme.vercel.app/explore does.
// Clicking a cluster zooms in; clicking a single point opens a small
// preview popup (photo, place, title, snippet of the story).
const ExploreGlobe = () => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | empty | error
  // Modal chơi game giáo dục ngay trên globe (khách chưa đăng nhập vẫn chơi
  // được vì rules cho read công khai). null = đang đóng; nếu mở:
  // { status: 'loading' | 'ready' | 'error', memory: object|null }
  const [gameView, setGameView] = useState(null);

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

    map.scrollZoom.enable();
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

      // Tải full memory doc khi khách bấm chơi game — spec game không nằm
      // sẵn trong GeoJSON feature để giữ payload globe nhẹ.
      const openGameLibrary = async (memoryId) => {
        setGameView({ status: 'loading', memory: null });
        try {
          const snap = await getDoc(doc(db, 'memories', memoryId));
          if (!isMounted) return;
          if (!snap.exists()) throw new Error('memory-not-found');
          setGameView({ status: 'ready', memory: { id: snap.id, ...snap.data() } });
        } catch (err) {
          console.error('[ExploreGlobe] failed to load memory for game:', err);
          if (isMounted) setGameView({ status: 'error', memory: null });
        }
      };

      map.on('click', 'unclustered-point', (e) => {
        const feature = e.features && e.features[0];
        if (!feature) return;
        const { title, story, place, imageData, hasGame, gameCount } = feature.properties;
        const coordinates = feature.geometry.coordinates.slice();

        const imageHtml = imageData
          ? `<div style="width:100%;height:110px;border-radius:8px;overflow:hidden;margin-bottom:8px;"><img src="${imageData}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`
          : '';

        // Nút chơi game giáo dục: chỉ hiện ở kỷ niệm có sẵn phiên bản game.
        const gameButtonHtml = hasGame
          ? `<button id="globe-game-btn" type="button" style="width:100%;margin-top:10px;padding:9px 12px;border:0;border-radius:9999px;background:var(--sage-green,#7a8a6b);color:#fff;font:inherit;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">🎮 Chơi game giáo dục${gameCount > 1 ? ` · ${gameCount} phiên bản` : ''}</button>`
          : '';

        popupRef.current
          .setLngLat(coordinates)
          .setHTML(`
            <div style="font-family:inherit;color:#2d1b0e;max-width:230px;">
              ${imageHtml}
              ${place ? `<div style="font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#7c3aed;margin-bottom:2px;">${escapeHtml(place)}</div>` : ''}
              <div style="font-weight:600;font-size:15px;margin-bottom:4px;">${escapeHtml(title)}</div>
              ${story ? `<div style="font-size:13px;line-height:1.4;color:#57534e;">${escapeHtml(story)}</div>` : ''}
              ${gameButtonHtml}
            </div>
          `)
          .addTo(map);

        // Popup là HTML mệnh lệnh (setHTML) nên gắn listener thủ công sau khi
        // nó đã được thêm vào DOM.
        const gameBtn = popupRef.current.getElement().querySelector('#globe-game-btn');
        if (gameBtn) {
          gameBtn.addEventListener('click', (clickEvt) => {
            clickEvt.stopPropagation();
            openGameLibrary(feature.properties.id);
          });
        }
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
        const features = snapshot.docs.map(buildGlobeFeature).filter(Boolean);

        if (!isMounted) return;

        if (features.length === 0) {
          setStatus('empty');
          return;
        }

        addSourceAndLayers(features);
        setStatus('ready');
      } catch (err) {
        // Signed-out visitors see this globe on the login screen, so if
        // Firestore Security Rules don't allow public read on `memories`,
        // every load here will fail with permission-denied. Add a rule like:
        //   match /memories/{id} { allow read: if true; }
        // (or scope it to a public/isPublic flag on the memory doc).
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

  // Đóng modal game bằng phím Escape.
  useEffect(() => {
    if (!gameView) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setGameView(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameView]);

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
      {status === 'error' && (
        <div
          className="absolute inset-x-0 bottom-3 text-center text-xs px-4"
          style={{ color: 'rgba(255,255,255,0.55)' }}
        >
          The memory map couldn't load right now.
        </div>
      )}

      {/* Modal chơi game giáo dục — dùng chung LearningGameLibrary như
          #journal/#play: liệt kê MỌI phiên bản, mỗi phiên bản có nút Chơi
          (iframe tap-to-load, sandbox). Chế độ xem nên không có nút xoá. */}
      {gameView && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6"
          style={{ background: 'rgba(18, 12, 30, 0.66)' }}
          onClick={() => setGameView(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Game giáo dục của kỷ niệm"
        >
          <div
            className="paper-texture cozy-shadow rounded-2xl w-full max-w-2xl max-h-[86vh] overflow-y-auto p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-journal font-semibold truncate" style={{ color: 'var(--deep-brown)' }}>
                  🎮 {gameView.memory?.title || 'Game giáo dục'}
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--warm-brown)' }}>
                  Chơi thử ngay cả khi chưa đăng nhập — tất cả phiên bản game của kỷ niệm này đều có ở đây.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGameView(null)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:shadow-md"
                style={{ background: 'var(--paper-white)', color: 'var(--warm-brown)', border: '1px solid var(--soft-beige)' }}
              >
                ✕ Đóng
              </button>
            </div>

            {gameView.status === 'loading' && (
              <div className="flex items-center justify-center gap-3 py-10 text-sm" style={{ color: 'var(--warm-brown)' }}>
                <span
                  className="inline-block w-5 h-5 border-3 border-t-transparent rounded-full animate-spin flex-shrink-0"
                  style={{ borderColor: 'var(--dusty-rose)', borderTopColor: 'transparent' }}
                  aria-hidden="true"
                />
                Đang mở các phiên bản game...
              </div>
            )}

            {gameView.status === 'error' && (
              <div className="rounded-lg p-4 text-sm text-center" style={{ background: '#fdeaea', color: '#a33' }}>
                Không tải được game của kỷ niệm này. Bạn có thể đóng hộp thoại và thử lại.
              </div>
            )}

            {gameView.status === 'ready' &&
              (normalizeGameVersions(gameView.memory).length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: 'var(--warm-brown)' }}>
                  Kỷ niệm này hiện chưa có phiên bản game giáo dục nào.
                </p>
              ) : (
                <LearningGameLibrary
                  memory={gameView.memory}
                  coverImage={gameView.memory.imageData}
                  height={380}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExploreGlobe;
