// api/learning-game.js
//
// Backend cho nút "🎮 Tạo game giáo dục" trong CreateMemory.jsx / Journal.jsx
// (MemorySpread edit) / MemoryDetailPanel.jsx.
//
// Nhận toàn bộ tư liệu của một memory:
//   - videoUrl  : link YouTube (tuỳ chọn) -> lấy phụ đề MIỄN PHÍ trước
//   - title     : tiêu đề memory
//   - story     : body description / câu chuyện
//   - imageData : data URL ảnh memory đã nén sẵn ở client (tuỳ chọn)
// rồi nhờ AI sinh một JSON game spec (quiz giáo dục) DIỄN GIẢI nội dung video
// kết hợp tiêu đề, câu chuyện và quan sát hình ảnh. Client tự render spec này
// thành một file HTML game tự chứa, chơi ngay trong iframe (xem
// src/lib/learningGame.js + src/components/LearningGamePlayer.jsx).
//
// Kiến trúc fallback giống api/video-to-learning.js:
//   Groq (miễn phí, thử trước)  ->  Gemini multimodal (dự phòng).
// Riêng Groq tách 2 model: text openai/gpt-oss-120b (không kèm ảnh) và
// vision qwen/qwen3.6-27b (khi có ảnh) — cùng lựa chọn model với dự án
// ai-doctor-admin3 (api/_lib/bringAnyIdeaToLifeProxy.js).

import { GoogleGenAI, FinishReason } from '@google/genai'
import {
  fetchYoutubeTranscript,
  MIN_TRANSCRIPT_CHARS,
  YoutubeTranscriptError,
} from './_lib/youtubeTranscript.js'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const GROQ_TEXT_MODEL = 'openai/gpt-oss-120b'
const GROQ_VISION_MODEL = 'qwen/qwen3.6-27b'
const GEMINI_MODEL = 'gemini-3.6-flash'
const GEMINI_TIMEOUT_MS = 110_000
const STORY_MAX_CHARS = 6000
const TITLE_MAX_CHARS = 300

class LearningGameError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Prompt: AI trả JSON spec, client mới là nơi render HTML. Giới hạn schema
// chặt để renderer khuôn mẫu luôn chạy được (không phụ thuộc AI viết JS/HTML
// sống — tránh hẳn bug HTML cắt cụt/JS lỗi của hướng sinh code tự do).
// ---------------------------------------------------------------------------
const GAME_SPEC_SYSTEM_PROMPT = `Bạn là một nhà sư phạm (pedagogist) kiêm nhà thiết kế game giáo dục đầu ngành.
Nhiệm vụ: từ tư liệu được cung cấp (phụ đề/video, tiêu đề, câu chuyện của một "memory" trên nhật ký Mindstamps, và có thể cả ảnh), hãy tạo một MINI GAME TRẮC NGHIỆM giáo dục giúp người chơi hiểu sâu nội dung video và gắn nó với kỷ niệm cá nhân.

NGUYÊN TẮC NỘI DUNG:
1. Câu hỏi phải DẠY thật sự: giải thích đúng khái niệm/sự kiện trong video, không hỏi mẹo vặt.
2. Trộn 3 loại câu hỏi (chỉ dùng loại có tư liệu tương ứng):
   - "video": kiểm tra ý chính, quy trình, khái niệm rút từ nội dung video.
   - "memory": liên kết kiến thức video với tiêu đề và câu chuyện của memory (suy luận, phản hồi cá nhân hoá).
   - "image": quan sát chi tiết trong ảnh và nối với bài học.
3. Mỗi đáp án sai phải hợp lý một cách "nghe được" (không đáp án rác rõ ràng); đáp án đúng được trộn ngẫu nhiên vị trí.
4. Phần "explanation" dạy lại 1-2 câu, có thể dựa trên video/story/ảnh.
5. Toàn bộ chữ người học đọc (tiêu đề, intro, câu hỏi, lựa chọn, giải thích, lời kết) viết bằng TIẾNG VIỆT tự nhiên, ấm áp, dễ hiểu cho người phổ thông; giữ nguyên danh riêng/thuật ngữ không dịch được.
6. intro là một bài học ngắn 4-7 câu tóm tắt điều quan trọng nhất của video VÀ cách nó gắn với memory này.

SCHEMA JSON BẮT BUỘC (chỉ trả JSON hợp lệ, không markdown, không chữ nào ngoài JSON):
{
  "gameTitle": "string, tên game ngắn gọn, vui tươi",
  "tagline": "string, một câu phụ đề",
  "intro": "string, bài học mở đầu, xuống dòng bằng \\n được",
  "questions": [
    {
      "emoji": "một emoji phù hợp câu hỏi",
      "topic": "video | memory | image",
      "question": "string",
      "choices": ["đáp án A", "đáp án B", "đáp án C", "đáp án D"],
      "answerIndex": 0,
      "explanation": "string, giải thích vì sao đáp án answerIndex đúng"
    }
  ],
  "closing": "string, lời kết khuyến khích sau khi chơi xong"
}

Số lượng câu hỏi: từ 6 đến 8. Mỗi câu ĐÚNG 4 lựa chọn, answerIndex nằm trong khoảng 0..3.`

function clip(text, max) {
  const t = (text || '').trim()
  return t.length > max ? t.slice(0, max) + ' […]' : t
}

function buildContextBlock({ title, story, transcript, hasImage, hasVideo }) {
  const parts = []
  parts.push(`TÊN MEMORY (tiêu đề):\n${clip(title, TITLE_MAX_CHARS) || '(không có)'}`)
  parts.push(`CÂU CHUYỆN / MÔ TẢ CỦA MEMORY (body description):\n${clip(story, STORY_MAX_CHARS) || '(không có)'}`)
  if (transcript) {
    parts.push(
      `NỘI DUNG VIDEO (toàn bộ phụ đề đã trích xuất — hãy coi đây là chính xác những gì video trình bày, KHÔNG được nói rằng bạn không xem được video):\n"""${transcript}"""`,
    )
  } else if (hasVideo) {
    parts.push('CÓ một video liên kết nhưng không trích được phụ đề — hãy bám sát tiêu đề, câu chuyện và ngữ cảnh để tạo game; nếu cần, suy luận bài học từ chính memory.')
  }
  if (hasImage) {
    parts.push('CÓ một ảnh đính kèm — hãy quan sát ảnh thật để tạo ít nhất 1 câu hỏi loại "image".')
  }
  parts.push(
    `Yêu cầu thêm: người chơi là chủ sở hữu memory này; hãy cá nhân hoá câu chữ cho thân mật. Hiện trạng tư liệu: video=${
      hasVideo ? 'có' : 'không'
    }, ảnh=${hasImage ? 'có' : 'không'}.`,
  )
  return parts.join('\n\n')
}

// --- data URL helpers -------------------------------------------------------

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '')
  if (!m) return null
  return { mime: m[1] || 'image/jpeg', base64: m[3] }
}

// --- Groq -------------------------------------------------------------------

async function callGroqJson({ apiKey, model, textPrompt, imageDataUrl }) {
  const content = [{ type: 'text', text: textPrompt }]
  if (imageDataUrl) {
    content.push({ type: 'image_url', image_url: { url: imageDataUrl } })
  }
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: GAME_SPEC_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      temperature: 0.75,
      response_format: { type: 'json_object' },
      // Sinh JSON spec (không phải HTML) nên output gọn; 2600 token dư sức
      // cho 8 câu hỏi đầy đủ giải thích, đồng thời né giới hạn token/phút.
      max_tokens: 2600,
    }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const status = res.status === 429 ? 429 : 502
    throw new LearningGameError(errBody?.error?.message || `Groq error (${res.status})`, status)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// --- Gemini (multimodal fallback) ------------------------------------------

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new LearningGameError(
              `Gemini xử lý quá lâu (vượt quá ${Math.round(ms / 1000)} giây). Hãy thử lại hoặc dùng video ngắn hơn.`,
              504,
            ),
          ),
        ms,
      ),
    ),
  ])

async function callGeminiJson({ apiKey, textPrompt, videoUrl, imageDataUrl }) {
  const ai = new GoogleGenAI({ apiKey })
  const parts = [{ text: `${GAME_SPEC_SYSTEM_PROMPT}\n\n${textPrompt}` }]

  const parsedImage = imageDataUrl ? parseDataUrl(imageDataUrl) : null
  if (parsedImage) {
    parts.push({ inlineData: { mimeType: parsedImage.mime, data: parsedImage.base64 } })
  }
  // Gemini đọc thẳng video YouTube qua fileData (cùng cách api/video-to-learning
  // đang dùng) — không cần phụ đề.
  if (videoUrl) {
    parts.push({ fileData: { mimeType: 'video/mp4', fileUri: videoUrl } })
  }

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: { temperature: 0.75, responseMimeType: 'application/json' },
    }),
    GEMINI_TIMEOUT_MS,
  )

  if (response.promptFeedback?.blockReason) {
    throw new LearningGameError(`Nội dung bị chặn (lý do: ${response.promptFeedback.blockReason})`, 400)
  }
  const firstCandidate = response.candidates?.[0]
  if (!firstCandidate) throw new LearningGameError('Không có kết quả trả về từ Gemini.', 502)
  if (firstCandidate.finishReason && firstCandidate.finishReason !== FinishReason.STOP) {
    if (firstCandidate.finishReason === FinishReason.SAFETY) {
      throw new LearningGameError('Nội dung bị chặn do cài đặt an toàn.', 400)
    }
    throw new LearningGameError(`Gemini dừng vì lý do: ${firstCandidate.finishReason}.`, 502)
  }
  return response.text ?? ''
}

// --- spec parsing & validation ----------------------------------------------

function parseLooseJSON(str) {
  if (!str || typeof str !== 'string') throw new LearningGameError('AI trả về nội dung rỗng.', 502)
  // Phòng hờ model bọc markdown fence hoặc kèm text bên ngoài JSON.
  const fenced = str.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : str
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}') + 1
  if (start === -1 || end <= start) throw new LearningGameError('AI không trả về JSON hợp lệ.', 502)
  return JSON.parse(candidate.substring(start, end))
}

function asString(v, fallback = '') {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

function normalizeSpec(raw) {
  const questions = Array.isArray(raw?.questions) ? raw.questions : []
  const normalizedQuestions = []

  for (const q of questions) {
    if (!q || typeof q !== 'object') continue
    const choices = Array.isArray(q.choices)
      ? q.choices.map((c) => asString(c)).filter(Boolean).slice(0, 4)
      : []
    if (choices.length !== 4) continue
    let answerIndex = Number.parseInt(q.answerIndex, 10)
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
      answerIndex = 0
    }
    normalizedQuestions.push({
      emoji: asString(q.emoji, '🎯').slice(0, 8),
      topic: ['video', 'memory', 'image'].includes(q.topic) ? q.topic : 'video',
      question: asString(q.question),
      choices,
      answerIndex,
      explanation: asString(q.explanation, 'Hãy nhớ lại phần giải thích trong bài học nhé.'),
    })
  }

  if (normalizedQuestions.length < 3) {
    throw new LearningGameError('Game AI tạo ra chưa đủ câu hỏi hợp lệ (cần ít nhất 3). Vui lòng thử lại.', 502)
  }

  return {
    gameTitle: asString(raw?.gameTitle, 'Game giáo dục từ kỷ niệm'),
    tagline: asString(raw?.tagline, 'Chơi để hiểu sâu hơn câu chuyện của bạn'),
    intro: asString(raw?.intro),
    questions: normalizedQuestions,
    closing: asString(raw?.closing, 'Cảm ơn bạn đã chơi — mỗi kỷ niệm đều là một bài học đáng nhớ.'),
  }
}

// ---------------------------------------------------------------------------

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
      error:
        'Chưa cấu hình GROQ_API_KEY lẫn GEMINI_API_KEY trên server. Thêm ít nhất một trong hai trong Vercel → Settings → Environment Variables rồi redeploy.',
    })
  }

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  } catch {
    return res.status(400).json({ error: 'Body không phải JSON hợp lệ.' })
  }

  const videoUrl = (body.videoUrl || '').trim() || null
  const title = (body.title || '').trim()
  const story = (body.story || '').trim()
  const imageDataUrl = typeof body.imageData === 'string' ? body.imageData : null

  if (!videoUrl && !title && !story && !imageDataUrl) {
    return res.status(400).json({
      error: 'Chưa có tư liệu nào để tạo game: cần ít nhất link video, tiêu đề, câu chuyện hoặc ảnh.',
    })
  }
  if (imageDataUrl && !parseDataUrl(imageDataUrl)) {
    return res.status(400).json({ error: 'Ảnh gửi lên không đúng định dạng data URL.' })
  }

  // Bước 1 (nếu có video): lấy phụ đề YouTube miễn phí — không tốn key AI.
  let transcript = null
  let transcriptNote = ''
  if (videoUrl) {
    try {
      transcript = await fetchYoutubeTranscript(videoUrl)
      if (transcript.length < MIN_TRANSCRIPT_CHARS) {
        transcriptNote = 'transcript-too-short'
        console.warn('[learning-game] Transcript too short, Groq will rely on title/story; Gemini can watch directly.')
      }
    } catch (err) {
      if (err instanceof YoutubeTranscriptError) {
        console.warn('[learning-game] Transcript unavailable:', err.message)
        transcript = null
      } else {
        throw err
      }
    }
  }

  const contextBlock = buildContextBlock({
    title,
    story,
    transcript,
    hasImage: Boolean(imageDataUrl),
    hasVideo: Boolean(videoUrl),
  })

  // Bước 2: Groq trước (miễn phí). Có ảnh -> vision model; không ảnh -> text.
  if (groqKey) {
    const attempts = []
    if (imageDataUrl) {
      attempts.push({ model: GROQ_VISION_MODEL, withImage: true })
    }
    // Vẫn thử text model không kèm ảnh như một lượt dự phòng bên trong Groq
    // (vision model có thể bị rate limit/khai tử — text model thường ổn định hơn).
    attempts.push({ model: GROQ_TEXT_MODEL, withImage: false })

    for (const attempt of attempts) {
      try {
        const raw = await callGroqJson({
          apiKey: groqKey,
          model: attempt.model,
          textPrompt: contextBlock,
          imageDataUrl: attempt.withImage ? imageDataUrl : null,
        })
        const spec = normalizeSpec(parseLooseJSON(raw))
        return res.status(200).json({
          spec,
          source: attempt.withImage ? 'groq-vision' : 'groq-text',
          transcript: transcriptNote || (transcript ? 'ok' : 'none'),
        })
      } catch (err) {
        console.warn(`[learning-game] Groq attempt (${attempt.model}) failed:`, err?.message || err)
      }
    }
  }

  // Bước 3: Gemini multimodal — xem trực tiếp video + ảnh, không cần phụ đề.
  if (!geminiKey) {
    return res.status(502).json({
      error:
        'Groq chưa tạo được game và server chưa cấu hình GEMINI_API_KEY để dự phòng. Vui lòng thử lại sau, hoặc thêm GEMINI_API_KEY.',
    })
  }

  try {
    const raw = await callGeminiJson({
      apiKey: geminiKey,
      textPrompt: contextBlock,
      videoUrl,
      imageDataUrl,
    })
    const spec = normalizeSpec(parseLooseJSON(raw))
    return res.status(200).json({ spec, source: 'gemini-fallback', transcript: transcript ? 'ok' : 'none' })
  } catch (err) {
    console.error('[learning-game] Gemini error:', err?.message || err)
    return res.status(err?.status || 500).json({ error: err?.message || 'Internal error' })
  }
}
