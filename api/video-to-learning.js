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
//
// Lỗi nhà cung cấp (429/503 UNAVAILABLE/timeout...) được retry tự động trong
// ngân sách thời gian cố định và LUÔN trả về thông báo tiếng Việt thân thiện
// (xem api/_lib/aiErrors.js) — không bao giờ đẩy JSON lỗi thô ra client.

import { GoogleGenAI, FinishReason } from '@google/genai'
import {
  fetchYoutubeTranscript,
  MIN_TRANSCRIPT_CHARS,
  YoutubeTranscriptError,
} from './_lib/youtubeTranscript.js'
import { fetchWithTimeout, retryWithBudget, respondWithAiError, parseAiError } from './_lib/aiErrors.js'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const GROQ_TEXT_MODEL = 'openai/gpt-oss-120b'
const GEMINI_MODEL = 'gemini-3.6-flash'
const GEMINI_TIMEOUT_MS = 95_000
// Ngân sách tổng cho mỗi nhánh provider — luôn thấp hơn maxDuration 120s của
// hàm (xem vercel.json), chừa thời gian cho transcript + truyền response.
const GROQ_BUDGET_MS = 50_000
const GEMINI_BUDGET_MS = 105_000

class VideoToLearningError extends Error {
  constructor(message, status = 500, retryable = undefined) {
    super(message)
    this.status = status
    if (retryable !== undefined) this.retryable = retryable
  }
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
  // Giữ nguyên status upstream (429/503...) để tầng retry + friendly message
  // phân loại đúng thay vì gộp tất cả thành 502.
  let res
  try {
    res = await fetchWithTimeout(
      `${GROQ_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: GROQ_TEXT_MODEL,
          messages: [{ role: 'user', content: promptText }],
          temperature: 0.75,
          response_format: { type: 'json_object' },
        }),
      },
      45_000,
    )
  } catch (err) {
    // Mạng/timeout — gắn cờ retryable rõ ràng cho retryWithBudget.
    const info = parseAiError(err, 'groq')
    throw new VideoToLearningError(info.upstreamMessage, info.status, true)
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const message = errBody?.error?.message || `Groq error (${res.status})`
    throw new VideoToLearningError(message, res.status)
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
              true,
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
    // Lỗi chính sách an toàn — retry vô nghĩa.
    throw new VideoToLearningError(`Nội dung bị chặn (lý do: ${response.promptFeedback.blockReason})`, 400, false)
  }
  const firstCandidate = response.candidates?.[0]
  if (!firstCandidate) throw new VideoToLearningError('Không có kết quả trả về từ Gemini.', 502)
  if (firstCandidate.finishReason && firstCandidate.finishReason !== FinishReason.STOP) {
    if (firstCandidate.finishReason === FinishReason.SAFETY) {
      throw new VideoToLearningError('Nội dung bị chặn do cài đặt an toàn.', 400, false)
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
      errorCode: 'NO_AI_KEY_CONFIGURED',
      retryable: false,
    })
  }

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  } catch {
    return res.status(400).json({ error: 'Body không phải JSON hợp lệ.', errorCode: 'BAD_REQUEST', retryable: false })
  }
  const { videoUrl, prompt } = body
  if (!prompt) return res.status(400).json({ error: 'Missing prompt', errorCode: 'BAD_REQUEST', retryable: false })
  if (!videoUrl) return res.status(400).json({ error: 'Missing videoUrl', errorCode: 'BAD_REQUEST', retryable: false })

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
      // 503/429 của Groq là quá tải tạm thời — tự thử lại trong ngân sách ~50s.
      const text = await retryWithBudget(() => callGroq(finalPrompt, groqKey), {
        label: 'video-to-learning/groq',
        budgetMs: GROQ_BUDGET_MS,
        maxAttempts: 3,
      })
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
    if (transcriptError instanceof YoutubeTranscriptError) {
      return res
        .status(transcriptError.status)
        .json({ error: transcriptError.message, errorCode: 'YOUTUBE_TRANSCRIPT', retryable: transcriptError.status >= 500 })
    }
    return res.status(502).json({
      error: 'Không lấy được transcript và chưa cấu hình GEMINI_API_KEY để dự phòng. Hãy thử video khác có phụ đề đầy đủ, hoặc thêm GEMINI_API_KEY.',
      errorCode: 'NO_GEMINI_FALLBACK',
      retryable: false,
    })
  }

  try {
    // Gemini chỉ retry 2 lần (mỗi lần có thể tới 95s); retryWithBudget tự bỏ
    // lượt thử thứ hai nếu lần đầu đã ăn gần hết ngân sách.
    const text = await retryWithBudget(() => callGemini(prompt, videoUrl, geminiKey), {
      label: 'video-to-learning/gemini',
      budgetMs: GEMINI_BUDGET_MS,
      maxAttempts: 2,
      baseDelayMs: 1500,
    })
    return res.status(200).json({ text, source: 'gemini-fallback' })
  } catch (err) {
    return respondWithAiError(res, err, 'gemini')
  }
}
