// api/_lib/youtubeTranscript.js
//
// Shared YouTube transcript fetching, extracted verbatim (same behavior,
// same comments) from api/video-to-learning.js so BOTH serverless
// functions can use it:
//   - api/video-to-learning.js  ("Tạo trang học tập từ video" -> spec text)
//   - api/learning-game.js      ("Tạo game giáo dục" -> JSON game spec)
//
// Strategy: scrape the watch page HTML for the "captionTracks" manifest
// YouTube embeds in its initial player response, then download the
// caption JSON and join every segment into one plain-text transcript.
// No API key needed — which is why the Groq+transcript path stays free.

export const MIN_TRANSCRIPT_CHARS = 200;
export const MAX_TRANSCRIPT_CHARS = 24000;

export class YoutubeTranscriptError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'YoutubeTranscriptError';
    this.status = status;
  }
}

export function extractYoutubeVideoId(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'youtu.be') {
    return u.pathname.split('/').filter(Boolean)[0] || null;
  }
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const match = u.pathname.match(/^\/(shorts|embed|live)\/([^/?]+)/);
    if (match) return match[2];
  }
  return null;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Fetches and joins the captions of a YouTube video as plain text.
 * Preferred languages are tried first; otherwise the first available
 * track is used. Returns null when the URL isn't a YouTube video.
 * @param {string} videoUrl
 * @param {string[]} preferredLangs
 * @returns {Promise<string|null>}
 */
export async function fetchYoutubeTranscript(videoUrl, preferredLangs = ['vi', 'en']) {
  const videoId = extractYoutubeVideoId(videoUrl || '');
  if (!videoId) throw new YoutubeTranscriptError('Link YouTube không hợp lệ.', 400);

  // Cookie CONSENT: tránh YouTube trả về trang "consent" cookie GDPR thay vì
  // trang video thật khi gọi từ IP server.
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'vi,en;q=0.9',
      Cookie: 'CONSENT=YES+1; SOCS=CAI',
    },
  });
  if (!pageRes.ok) throw new YoutubeTranscriptError('Không tải được trang video YouTube.', 502);
  const html = await pageRes.text();

  const match = html.match(/"captionTracks":(\[.*?\])/);
  if (!match) {
    const looksLikeConsentWall = /consent\.youtube\.com|Before you continue to YouTube/i.test(html);
    throw new YoutubeTranscriptError(
      looksLikeConsentWall
        ? 'YouTube trả về trang xác nhận cookie thay vì trang video (lỗi tạm thời). Vui lòng thử lại.'
        : 'Video này không có phụ đề (caption) nên chưa thể phân tích. Hãy thử một video khác có bật phụ đề (tự động hoặc thủ công).',
      422,
    );
  }

  let tracks;
  try {
    tracks = JSON.parse(match[1]);
  } catch {
    throw new YoutubeTranscriptError('Không đọc được danh sách phụ đề của video.', 502);
  }
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new YoutubeTranscriptError('Video này không có phụ đề.', 422);
  }

  let track = null;
  for (const lang of preferredLangs) {
    track = tracks.find((t) => t.languageCode === lang);
    if (track) break;
  }
  if (!track) track = tracks[0];

  const transcriptUrl = `${track.baseUrl}&fmt=json3`;
  const transcriptRes = await fetch(transcriptUrl, { headers: { 'User-Agent': UA } });
  if (!transcriptRes.ok) throw new YoutubeTranscriptError('Không tải được nội dung phụ đề.', 502);
  const data = await transcriptRes.json();

  const lines = [];
  for (const event of data.events || []) {
    if (!event.segs) continue;
    const text = event.segs.map((s) => s.utf8 || '').join('');
    const clean = text.replace(/\n/g, ' ').trim();
    if (clean) lines.push(clean);
  }
  const transcript = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (!transcript) throw new YoutubeTranscriptError('Phụ đề video này trống, không thể phân tích.', 422);

  return transcript.length > MAX_TRANSCRIPT_CHARS
    ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + ' […]'
    : transcript;
}
