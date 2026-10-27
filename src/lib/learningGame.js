// src/lib/learningGame.js
//
// "Tạo game giáo dục" — client counterpart của api/learning-game.js.
//
// Luồng dữ liệu (bám theo pattern BringAnyIdeaToLifePanel ở ai-doctor-admin3:
// AI tạo sản phẩm, client nhúng trong iframe có "tap-to-load" gate):
//   1. Nén ảnh memory xuống kích thước đủ nhỏ để gửi qua serverless function
//      (giới hạn body ~4.5MB) và rẻ token vision.
//   2. Gọi /api/learning-game với videoUrl + title + story + ảnh + các style
//      đã dùng -> server chọn một STYLE KHÁC và trả JSON game spec.
//   3. Mỗi lần bấm tạo tạo ra một PHIÊN BẢN mới (Version 1, 2, 3...) lưu trong
//      mảng learningGameVersions của memory; renderLearningGameHtml() (xem
//      gameRenderers.js) biến spec thành HTML tự chứa chơi ngay trong iframe.
//
// Firestore chỉ lưu spec JSON (nhỏ); HTML render tức thời mỗi lần chơi từ
// spec + ảnh memory, nên không vượt giới hạn 1MB/document của Firestore.

import { sanitizeAiErrorMessage } from './videoLearning.js';
import { GAME_STYLE_IDS } from './gameStyles.js';
import { renderLearningGameHtml, describeGameSource, describeGameContent } from './gameRenderers.js';

export { renderLearningGameHtml, describeGameSource, describeGameContent };

export class LearningGameError extends Error {}

// Giới hạn số phiên bản mỗi memory — vừa kiểm soát kích thước document
// Firestore (ảnh đã chiếm tới ~1MB), vừa giữ danh sách phiên bản gọn gàng.
export const MAX_GAME_VERSIONS = 6;

// Tên field dữ liệu chính của mỗi style (dùng để validate response server).
const STYLE_PAYLOAD_KEY = {
  quiz: 'questions',
  truefalse: 'statements',
  matching: 'pairs',
  flashcards: 'cards',
  scenario: 'scenarios',
};

// ---------------------------------------------------------------------------
// Image compression
// ---------------------------------------------------------------------------

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new LearningGameError('Không đọc được ảnh để gửi cho AI.'));
    img.src = dataUrl;
  });
}

/**
 * Downscale a data-URL photo to a compact JPEG data URL suitable for the
 * vision model. Walks dimensions/quality down until it fits maxBytes.
 * @param {string} dataUrl
 * @returns {Promise<string|null>}
 */
export async function compressImageForVision(dataUrl, { maxDim = 800, quality = 0.72, maxBytes = 350_000 } = {}) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;

  // Ảnh nhỏ sẵn thì gửi nguyên, không mất chất lượng.
  if (dataUrl.length <= maxBytes) return dataUrl;

  const img = await loadImageFromDataUrl(dataUrl);
  const dimSteps = [maxDim, 640, 512, 384];
  const qualitySteps = [quality, 0.6, 0.5, 0.4];
  let smallest = null;

  for (const dim of dimSteps) {
    const scale = Math.min(1, dim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    for (const q of qualitySteps) {
      const out = canvas.toDataURL('image/jpeg', q);
      if (!smallest || out.length < smallest.length) smallest = out;
      if (out.length <= maxBytes) return out;
    }
  }
  return smallest || dataUrl;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

/**
 * @param {{ title?: string, story?: string, videoUrl?: string|null,
 *           imageData?: string|null, excludeStyles?: string[] }} input
 * @returns {Promise<{ spec: object, source: string }>}
 */
export async function generateLearningGame({
  title = '',
  story = '',
  videoUrl = '',
  imageData = null,
  excludeStyles = [],
} = {}) {
  let compressedImage = null;
  if (imageData) {
    try {
      compressedImage = await compressImageForVision(imageData);
    } catch (err) {
      // Ảnh lỗi không được chặn cả request — game vẫn tạo được từ video/chữ.
      console.warn('[learningGame] image compression skipped:', err?.message || err);
    }
  }

  let res;
  try {
    res = await fetch('/api/learning-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || '',
        story: story || '',
        videoUrl: videoUrl || null,
        imageData: compressedImage,
        excludeStyles: Array.isArray(excludeStyles) ? excludeStyles.filter((s) => GAME_STYLE_IDS.includes(s)) : [],
      }),
    });
  } catch (networkErr) {
    throw new LearningGameError(
      `Không kết nối được tới server tạo game: ${networkErr?.message || 'network error'}. Kiểm tra mạng rồi thử lại.`,
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Server đã trả thông báo tiếng Việt; sanitize phòng khi còn sót chuỗi
    // JSON kỹ thuật của nhà cung cấp AI (sự cố 503 UNAVAILABLE 27/10/2026).
    throw new LearningGameError(sanitizeAiErrorMessage(data?.error || `Lỗi máy chủ (${res.status})`));
  }

  const spec = data?.spec;
  const style = spec?.style;
  const payloadKey = STYLE_PAYLOAD_KEY[style];
  if (!spec || !payloadKey || !Array.isArray(spec[payloadKey]) || spec[payloadKey].length === 0) {
    throw new LearningGameError('AI trả về game spec không hợp lệ. Vui lòng thử lại.');
  }
  return { spec, source: data.source || 'unknown' };
}

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Đóng gói spec AI vừa tạo thành một phiên bản lưu được trên memory.
 * @returns {{id:string, style:string, title:string, spec:object, source:string, createdAt:string}}
 */
export function createGameVersion(spec, source = '') {
  return {
    id: makeId(),
    style: spec.style || 'quiz',
    title: spec.gameTitle || 'Game giáo dục',
    spec,
    source: source || '',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Chuẩn hoá dữ liệu game của một memory về mảng phiên bản, tương thích ngược
 * với memory cũ chỉ có field đơn `learningGame` (trước khi có versioning).
 * @returns {Array}
 */
export function normalizeGameVersions(memory = {}) {
  if (Array.isArray(memory.learningGameVersions) && memory.learningGameVersions.length > 0) {
    return memory.learningGameVersions.filter(
      (v) => v && v.spec && typeof v.spec === 'object' && STYLE_PAYLOAD_KEY[v.style || v.spec.style || 'quiz'],
    );
  }
  if (memory.learningGame && typeof memory.learningGame === 'object') {
    return [
      {
        id: 'legacy-single-version',
        style: memory.learningGame.style || 'quiz',
        title: memory.learningGame.gameTitle || 'Game giáo dục',
        spec: memory.learningGame,
        source: memory.learningGameSource || '',
        createdAt: null,
      },
    ];
  }
  return [];
}

export function formatVersionDate(iso) {
  if (!iso) return 'Phiên bản cũ';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Phiên bản cũ';
  }
}
