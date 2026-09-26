// api/video-to-learning.js
//
// Backend cho nút "Tạo trang học tập từ video" trong CreateMemory.jsx.
// Ported/rút gọn từ ai-doctor-admin (api/_lib/videoToLearningProxy.js +
// api/_lib/youtubeTranscript.js) — GIỮ nguyên kiến trúc fallback tự động
// Groq (transcript, miễn phí, thử trước) ↔ Gemini (xem video trực tiếp, dự
// phòng khi transcript không lấy được/quá ngắn — CẦN THIẾT vì YouTube hay
// chặn/trả trang khác khi cào từ server, không phải lúc nào cũng do video
// thật sự tắt phụ đề). BỎ so với bản gốc:
//   - Nhánh Facebook (facebookTranscript.js/facebookVideo.js) — v1 chỉ cần
//     YouTube; xem src/lib/videoLink.js phía client cũng chỉ nhận YouTube.
//   - API key pool / rotation nhiều key — chỉ đọc GROQ_API_KEY/GEMINI_API_KEY
//     đơn (không có *_API_KEY1, *_API_KEY2, ...).
// Nếu sau này cần các phần trên, xem lại bản gốc ở ai-doctor-admin để port
// tiếp.
//
// Thêm biến môi trường trên Vercel: Settings → Environment Variables:
//   - GROQ_API_KEY (bắt buộc, free tại https://console.groq.com/keys)
//   - GEMINI_API_KEY (khuyến khích, free tier tại https://aistudio.google.com/apikey
//     — dùng làm dự phòng khi không lấy được transcript YouTube)
// rồi Redeploy. Đồng thời xem vercel.json — hàm này cần maxDuration cao hơn
// mặc định vì bước Gemini xem video có thể mất tới ~110 giây.

import { GoogleGenAI, FinishReason } from '@google/genai'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const GROQ_TEXT_MODEL = 'openai/gpt-oss-120b'
const GEMINI_MODEL = 'gemini-3.6-flash'
const MIN_TRANSCRIPT_CHARS = 200
const MAX_TRANSCRIPT_CHARS = 24000
const GEMINI_TIMEOUT_MS = 110_000

class VideoToLearningError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.status = status
  }
}

function extractYoutubeVideoId(rawUrl) {
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
  if (host === 'youtu.be') {
    return u.pathname.split('/').filter(Boolean)[0] || null
  }
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v')
    const match = u.pathname.match(/^\/(shorts|embed|live)\/([^/?]+)/)
    if (match) return match[2]
  }
  return null
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function fetchYoutubeTranscript(videoUrl, preferredLangs = ['vi', 'en']) {
  const videoId = extractYoutubeVideoId(videoUrl || '')
  if (!videoId) throw new VideoToLearningError('Link YouTube không hợp lệ.', 400)

  // Cookie CONSENT: tránh YouTube trả về trang "consent" cookie GDPR thay vì
  // trang video thật khi gọi từ IP server (xem ghi chú gốc ở ai-doctor-admin).
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'vi,en;q=0.9',
      Cookie: 'CONSENT=YES+1; SOCS=CAI',
    },
  })
  if (!pageRes.ok) throw new VideoToLearningError('Không tải được trang video YouTube.', 502)
  const html = await pageRes.text()

  const match = html.match(/"captionTracks":(\[.*?\])/)
  if (!match) {
    const looksLikeConsentWall = /consent\.youtube\.com|Before you continue to YouTube/i.test(html)
    throw new VideoToLearningError(
      looksLikeConsentWall
        ? 'YouTube trả về trang xác nhận cookie thay vì trang video (lỗi tạm thời). Vui lòng thử lại.'
        : 'Video này không có phụ đề (caption) nên chưa thể phân tích. Hãy thử một video khác có bật phụ đề (tự động hoặc thủ công).',
      422,
    )
  }

  let tracks
  try {
    tracks = JSON.parse(match[1])
  } catch {
    throw new VideoToLearningError('Không đọc được danh sách phụ đề của video.', 502)
  }
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new VideoToLearningError('Video này không có phụ đề.', 422)
  }

  let track = null
  for (const lang of preferredLangs) {
    track = tracks.find((t) => t.languageCode === lang)
    if (track) break
  }
  if (!track) track = tracks[0]

  const transcriptUrl = `${track.baseUrl}&fmt=json3`
  const transcriptRes = await fetch(transcriptUrl, { headers: { 'User-Agent': UA } })
  if (!transcriptRes.ok) throw new VideoToLearningError('Không tải được nội dung phụ đề.', 502)
  const data = await transcriptRes.json()

  const lines = []
  for (const event of data.events || []) {
    if (!event.segs) continue
    const text = event.segs.map((s) => s.utf8 || '').join('')
    const clean = text.replace(/\n/g, ' ').trim()
    if (clean) lines.push(clean)
  }
  const transcript = lines.join(' ').replace(/\s+/g, ' ').trim()
  if (!transcript) throw new VideoToLearningError('Phụ đề video này trống, không thể phân tích.', 422)

  return transcript.length > MAX_TRANSCRIPT_CHARS ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + ' […]' : transcript
}

function buildTranscriptOverridePrompt(originalPrompt, transcript) {
  return `${originalPrompt}

---
GHI CHU QUAN TRONG: ban KHONG duoc xem truc tiep video. Thay vao do, duoi day la toan bo noi dung van ban da trich ra tu video nay - hay coi day la toan bo nhung gi ban "biet" ve video va dua hoan toan vao no, khong duoc noi rang ban thieu hinh anh hay khong xem duoc video:
"""
${transcript}
"""`
}

async function callGroq(promptText, apiKey) {
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_TEXT_MODEL,
      messages: [{ role: 'user', content: promptText }],
      temperature: 0.75,
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new VideoToLearningError(errBody?.error?.message || `Groq error (${res.status})`, res.status === 429 ? 429 : 502)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// --- Gemini (multimodal, xem trực tiếp video, dùng khi transcript thất bại) ---
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new VideoToLearningError(
              `Gemini xử lý video quá lâu (vượt quá ${Math.round(ms / 1000)} giây). Video có thể quá dài — hãy thử video ngắn hơn.`,
              504,
            ),
          ),
        ms,
      ),
    ),
  ])

async function callGemini(promptText, videoUrl, apiKey) {
  const ai = new GoogleGenAI({ apiKey })
  const parts = [{ text: promptText }]
  if (videoUrl) parts.push({ fileData: { mimeType: 'video/mp4', fileUri: videoUrl } })

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: { temperature: 0.75 },
    }),
    GEMINI_TIMEOUT_MS,
  )

  if (response.promptFeedback?.blockReason) {
    throw new VideoToLearningError(`Nội dung bị chặn (lý do: ${response.promptFeedback.blockReason})`, 400)
  }
  const firstCandidate = response.candidates?.[0]
  if (!firstCandidate) throw new VideoToLearningError('Không có kết quả trả về từ Gemini.', 502)
  if (firstCandidate.finishReason && firstCandidate.finishReason !== FinishReason.STOP) {
    if (firstCandidate.finishReason === FinishReason.SAFETY) {
      throw new VideoToLearningError('Nội dung bị chặn do cài đặt an toàn.', 400)
    }
    throw new VideoToLearningError(`Gemini dừng vì lý do: ${firstCandidate.finishReason}.`, 502)
  }
  return response.text ?? ''
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const groqKey = process.env.GROQ_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if (!groqKey && !geminiKey) {
    return res.status(501).json({
      error: 'Chưa cấu hình GROQ_API_KEY lẫn GEMINI_API_KEY trên server. Thêm ít nhất một trong hai trong Vercel → Settings → Environment Variables rồi redeploy.',
    })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const { videoUrl, prompt } = body
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' })
  if (!videoUrl) return res.status(400).json({ error: 'Missing videoUrl' })

  // Bước 1: thử lấy transcript + Groq (nhanh, miễn phí).
  let transcriptResult = null
  let transcriptError = null
  if (groqKey) {
    try {
      transcriptResult = await fetchYoutubeTranscript(videoUrl)
    } catch (err) {
      transcriptError = err
    }
  }
  const hasEnoughTranscript = Boolean(transcriptResult && transcriptResult.length >= MIN_TRANSCRIPT_CHARS)

  if (hasEnoughTranscript && groqKey) {
    try {
      const finalPrompt = buildTranscriptOverridePrompt(prompt, transcriptResult)
      const text = await callGroq(finalPrompt, groqKey)
      return res.status(200).json({ text, source: 'groq-transcript' })
    } catch (err) {
      console.warn('[video-to-learning] Groq failed, falling back to Gemini:', err?.message || err)
    }
  } else if (transcriptError) {
    console.warn('[video-to-learning] Transcript unavailable, falling back to Gemini:', transcriptError.message)
  } else if (transcriptResult) {
    console.warn('[video-to-learning] Transcript too short, falling back to Gemini')
  }

  // Bước 2: dự phòng Gemini — xem trực tiếp video (không cần transcript/phụ đề).
  if (!geminiKey) {
    if (transcriptError instanceof VideoToLearningError) {
      return res.status(transcriptError.status).json({ error: transcriptError.message })
    }
    return res.status(502).json({
      error: 'Không lấy được transcript và chưa cấu hình GEMINI_API_KEY để dự phòng. Hãy thử video khác có phụ đề đầy đủ, hoặc thêm GEMINI_API_KEY.',
    })
  }

  try {
    const text = await callGemini(prompt, videoUrl, geminiKey)
    return res.status(200).json({ text, source: 'gemini-fallback' })
  } catch (err) {
    console.error('[video-to-learning] Gemini error:', err?.message || err)
    return res.status(err?.status || 500).json({ error: err?.message || 'Internal error' })
  }
}
