// src/lib/globeMemories.js
//
// Helper thuần biến memory doc (Firestore) thành GeoJSON feature cho quả địa
// cầu ExploreGlobe ở màn hình đăng nhập. Tách riêng khỏi component mapbox để
// test bằng Node không cần kéo theo mapbox-gl.
//
// Lưu ý kích thước: globe tải tối đa 500 memory, nên feature CHỈ giữ các field
// nhẹ để vẽ điểm + popup. Toàn bộ spec game giáo dục (learningGameVersions,
// tối đa 6 phiên bản/memory) KHÔNG nhúng vào đây — chỉ gắn cờ hasGame/
// gameCount; khi khách bấm "Chơi game" mới getDoc riêng memory đó (xem
// ExploreGlobe.jsx). Firestore rules cho phép read công khai collection
// `memories` nên khách chưa đăng nhập vẫn getDoc được.

import { normalizeGameVersions } from './learningGame.js';

const truncate = (text = '', max = 160) => {
  const clean = String(text).trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
};

/**
 * @param {{id:string, data:Function}} docSnap Firestore QueryDocumentSnapshot-like
 * @returns {object|null} GeoJSON Feature, hoặc null nếu thiếu toạ độ hợp lệ
 */
export function buildGlobeFeature(docSnap) {
  const data = (docSnap && docSnap.data) ? docSnap.data() || {} : {};
  const lat = data.location?.lat;
  const lng = data.location?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  // Dùng chung helper versioning để đếm đúng cả memory mới (mảng versions) lẫn
  // memory cũ (field learningGame đơn lẻ) và loại bỏ phiên bản rác.
  const gameVersions = normalizeGameVersions(data);

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id: docSnap.id,
      title: data.title || 'A memory',
      story: truncate(data.story || ''),
      place: data.location?.name || '',
      imageData: data.imageData || null,
      hasGame: gameVersions.length > 0,
      gameCount: gameVersions.length,
    },
  };
}
