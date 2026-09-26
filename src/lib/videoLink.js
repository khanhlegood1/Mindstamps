// src/lib/videoLink.js
//
// Nhận diện link video YouTube mà người dùng dán vào ô "Link video" khi tạo
// kỷ niệm. Ported từ ai-doctor-admin (src/bring-any-idea-to-life-khanh/src/lib/videoLink.ts,
// vốn cũng ported từ src/video-to-learning-khanh/src/lib/linkClassifier.ts + youtube.ts).
//
// v1: CHỈ hỗ trợ YouTube (không có Facebook) — vì backend
// (api/video-to-learning.js) hiện chỉ lấy được transcript miễn phí từ
// YouTube. Có thể bổ sung Facebook sau nếu cần, giống bản gốc bên
// ai-doctor-admin.

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

export function getYouTubeVideoId(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'www.youtube.com' || parsedUrl.hostname === 'youtube.com' || parsedUrl.hostname === 'm.youtube.com') {
      const videoId = parsedUrl.searchParams.get('v');
      if (videoId && videoId.length === 11) return videoId;
      if (parsedUrl.pathname.startsWith('/shorts/')) {
        const id = parsedUrl.pathname.split('/')[2];
        if (id && id.length === 11) return id;
      }
      if (parsedUrl.pathname.startsWith('/embed/')) {
        const id = parsedUrl.pathname.substring(7);
        if (id && id.length === 11) return id;
      }
      if (parsedUrl.pathname.startsWith('/live/')) {
        const id = parsedUrl.pathname.split('/')[2];
        if (id && id.length === 11) return id;
      }
    }
    if (parsedUrl.hostname === 'youtu.be') {
      const videoId = parsedUrl.pathname.substring(1);
      if (videoId && videoId.length === 11) return videoId;
    }
  } catch {
    // fallthrough to regex below
  }
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|live\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  if (match && match[2]?.length === 11) return match[2];
  return null;
}

function parseHttpUrl(rawInput) {
  const raw = (rawInput || '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

export function isYouTubeHost(rawInput) {
  const parsed = parseHttpUrl(rawInput);
  if (!parsed) return false;
  return YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase());
}

/** Trả về null nếu KHÔNG phải link video YouTube hợp lệ (vd trang chủ, kênh). */
export function classifyVideoUrl(rawInput) {
  const parsed = parseHttpUrl(rawInput);
  if (!parsed) return null;
  const hostname = parsed.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(hostname) && getYouTubeVideoId(parsed.toString())) {
    return { url: parsed.toString(), type: 'youtube' };
  }
  return null;
}

export function getYoutubeEmbedUrl(url) {
  const videoId = getYouTubeVideoId(url);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
}
