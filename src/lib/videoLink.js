// src/lib/videoLink.js
//
// Classifies a raw URL as a *specific* YouTube or Facebook video link
// (as opposed to a channel, group, or homepage). Used to decide whether
// a link the user pastes should be sent to the backend as `videoUrl`
// (transcript / direct video processing) instead of `webUrl` (generic
// page scrape) or `imageUrl` (vision/OCR).
//
// Ported from khanhlegood3/ai-doctor-admin's
// src/bring-any-idea-to-life-khanh/lib/videoLink.ts

/** @typedef {'youtube' | 'facebook'} VideoLinkType */
/** @typedef {{ url: string, type: VideoLinkType }} ClassifiedVideoLink */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

const FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'fb.watch',
]);

/**
 * Extracts an 11-character YouTube video ID from a URL, handling
 * watch?v=, /shorts/, /embed/, /live/, and youtu.be/<id> forms.
 * @param {string} url
 * @returns {string | null}
 */
function getYouTubeVideoId(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const idPattern = /^[a-zA-Z0-9_-]{11}$/;

  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id && idPattern.test(id) ? id : null;
  }

  if (!YOUTUBE_HOSTS.has(host)) return null;

  // /watch?v=<id>
  const v = parsed.searchParams.get('v');
  if (v && idPattern.test(v)) return v;

  // /shorts/<id>, /embed/<id>, /live/<id>
  const segments = parsed.pathname.split('/').filter(Boolean);
  const markers = ['shorts', 'embed', 'live'];
  for (let i = 0; i < segments.length - 1; i++) {
    if (markers.includes(segments[i]) && idPattern.test(segments[i + 1])) {
      return segments[i + 1];
    }
  }

  return null;
}

/**
 * True if the path looks like a specific Facebook video (not a page/group/home).
 * @param {string} pathname
 */
function isFacebookVideoPath(pathname) {
  return /\/(videos|watch|reel|share\/v|share\/r)\b/i.test(pathname) || pathname === '/watch';
}

/**
 * Classifies a raw user-entered string as a specific video link, or null
 * if it isn't one (e.g. a channel URL, a group URL, or a non-video page —
 * those should fall through to the `webUrl` handling instead).
 * @param {string} rawInput
 * @returns {ClassifiedVideoLink | null}
 */
export function classifyVideoUrl(rawInput) {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  if (FACEBOOK_HOSTS.has(host) && isFacebookVideoPath(parsed.pathname)) {
    return { url: withScheme, type: 'facebook' };
  }

  if (YOUTUBE_HOSTS.has(host) && getYouTubeVideoId(withScheme)) {
    return { url: withScheme, type: 'youtube' };
  }

  return null;
}

/**
 * True if the string is at least a well-formed http(s) URL (used as the
 * fallback check before treating input as a generic `webUrl`).
 * @param {string} rawInput
 */
export function isValidHttpUrl(rawInput) {
  if (!rawInput) return false;
  const trimmed = rawInput.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
