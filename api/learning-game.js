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
import { fetchWithTimeout, retryWithBudget, respondWithAiError, parseAiError } from './_lib/aiErrors.js'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const GROQ_TEXT_MODEL = 'openai/gpt-oss-120b'
const GROQ_VISION_MODEL = 'qwen/qwen3.6-27b'
const GEMINI_MODEL = 'gemini-3.6-flash'
// Thấp hơn maxDuration 120s của hàm (vercel.json) để chừa ngân sách cho cả
// nhánh Groq lẫn retry — xem GLOBAL_BUDGET_MS trong handler.
const GROQ_CALL_TIMEOUT_MS = 30_000
const GROQ_ATTEMPT_BUDGET_MS = 32_000
const GEMINI_TIMEOUT_MS = 80_000
const GEMINI_BUDGET_MS = 95_000
const GLOBAL_BUDGET_MS = 112_000
const STORY_MAX_CHARS = 6000
const TITLE_MAX_CHARS = 300

class LearningGameError extends Error {
  // retryable: mặc định suy ra từ HTTP status (429/5xx retry được); các lỗi
  // validate spec/JSON do chính code mình phát hiện thì truyền false rõ ràng.
  constructor(message, status = 500, retryable = undefined) {
    super(message)
    this.status = status
    if (retryable !== undefined) this.retryable = retryable
  }
}

// ---------------------------------------------------------------------------
// Prompt: AI trả JSON spec, client mới là nơi render HTML. Giới hạn schema
// chặt để renderer khuôn mẫu luôn chạy được (không phụ thuộc AI viết JS/HTML
// sống — tránh hẳn bug HTML cắt cụt/JS lỗi của hướng sinh code tự do).
//
// Mỗi lần tạo là một PHIÊN BẢN với phong cách chơi khác nhau: server chọn
// style chưa dùng (xem pickNextStyle) và dùng đúng schema của style đó.
// ---------------------------------------------------------------------------

const COMMON_PROMPT_RULES = `Bạn là một nhà sư phạm (pedagogist) kiêm nhà thiết kế game giáo dục đầu ngành.
Nhiệm vụ: từ tư liệu được cung cấp (phụ đề/video, tiêu đề, câu chuyện của một "memory" trên nhật ký Mindstamps, và có thể cả ảnh), hãy tạo một MINI GAME giáo dục giúp người chơi hiểu sâu nội dung video và gắn nó với kỷ niệm cá nhân.

NGUYÊN TẮC NỘI DUNG:
1. Mọi câu hỏi/tình huống/thẻ đều phải DẠY thật sự: bám đúng khái niệm, sự kiện, quy trình trong video, không hỏi mẹo vặt.
2. Trộn 3 nguồn tư liệu (chỉ dùng loại có tư liệu tương ứng), ghi ở field "topic" với giá trị "video" | "memory" | "image":
   - "video": kiểm tra ý chính, quy trình, khái niệm rút từ nội dung video.
   - "memory": liên kết kiến thức video với tiêu đề và câu chuyện của memory (suy luận, cá nhân hoá).
   - "image": quan sát chi tiết trong ảnh và nối với bài học.
3. Các lựa chọn/nhận định sai phải hợp lý một cách "nghe được" (không có đáp án rác rõ ràng).
4. Phần "explanation" dạy lại 1-2 câu, có thể dựa trên video/story/ảnh.
5. Toàn bộ chữ người học đọc viết bằng TIẾNG VIỆT tự nhiên, ấm áp, dễ hiểu cho người phổ thông; giữ nguyên danh riêng/thuật ngữ không dịch được.
6. "intro" là bài học ngắn 4-7 câu tóm tắt điều quan trọng nhất của video VÀ cách nó gắn với memory này; "gameTitle" ngắn gọn vui tươi, "closing" là lời kết khuyến khích.

CHỈ trả JSON hợp lệ theo đúng schema được yêu cầu, không markdown, không chữ nào ngoài JSON.`

const ACTION_GUIDE = {
  label: 'Hành động trực quan: di chuyển, thu thập, né vật thể', minItems: 3,
  schema: `Chỉ sinh JSON cấu hình, không HTML/JS. Hãy biến tư liệu thành thế giới tương tác trực quan, không hỏi trắc nghiệm.
  Schema: {"gameTitle":"string","tagline":"string","intro":"string","closing":"string","playerEmoji":"🧑‍🚀","objects":[{"emoji":"🌍","label":"tên ngắn","lesson":"bài học từ tư liệu khi thu thập","collect":true},{"emoji":"☄️","label":"vật cản","lesson":"vì sao cần tránh","collect":false}]}.
  Tạo 4-8 vật thể có emoji đơn giản, ít nhất 3 vật thể collect=true và 1 chướng ngại collect=false. Gameplay: nhân vật di chuyển ngang, thu thập vật thể rơi, né vật cản. Không tạo câu hỏi/đáp án. Dùng màu sắc và vật thể liên quan ảnh/video/câu chuyện.`,
}
const STYLE_GUIDES = {
  action: ACTION_GUIDE,
  custom: ACTION_GUIDE,
  quiz: {
    label: 'Trắc nghiệm 4 đáp án',
    minItems: 3,
    target: '6 đến 8',
    schema: `Schema JSON BẮT BUỘC:
{
  "gameTitle": "string", "tagline": "string", "intro": "string (\\n để xuống dòng)",
  "questions": [
    {
      "emoji": "một emoji phù hợp",
      "topic": "video | memory | image",
      "question": "string",
      "choices": ["đáp án A", "đáp án B", "đáp án C", "đáp án D"],
      "answerIndex": 0,
      "explanation": "string, giải thích vì sao answerIndex đúng"
    }
  ],
  "closing": "string"
}
Tạo ${'6 đến 8'} câu hỏi. Mỗi câu ĐÚNG 4 lựa chọn, answerIndex trong khoảng 0..3.`,
  },
  truefalse: {
    label: 'Đúng hay Sai',
    minItems: 3,
    target: '7 đến 9',
    schema: `Schema JSON BẮT BUỘC:
{
  "gameTitle": "string", "tagline": "string", "intro": "string (\\n để xuống dòng)",
  "statements": [
    {
      "emoji": "một emoji phù hợp",
      "topic": "video | memory | image",
      "statement": "một nhận định để người chơi phán đoán Đúng hay Sai",
      "isTrue": true,
      "explanation": "string, giải thích vì sao nhận định này đúng hoặc sai"
    }
  ],
  "closing": "string"
}
Tạo 7 đến 9 nhận định, trộn lẫn hợp lý giữa isTrue true và false (không dồn cùng một giá trị).`,
  },
  matching: {
    label: 'Ghép cặp khái niệm',
    minItems: 3,
    target: '5 đến 7',
    schema: `Schema JSON BẮT BUỘC:
{
  "gameTitle": "string", "tagline": "string", "intro": "string (\\n để xuống dòng)",
  "pairs": [
    { "left": "khái niệm/thuật ngữ/tên gọi ngắn gọn", "right": "định nghĩa hoặc ý nghĩa tương ứng, 1-2 câu" }
  ],
  "closing": "string"
}
Tạo 5 đến 7 cặp. Mọi "left" phải phân biệt rõ và mỗi "right" chỉ khớp đúng một "left".`,
  },
  flashcards: {
    label: 'Thẻ ghi nhớ lật mặt',
    minItems: 3,
    target: '8 đến 10',
    schema: `Schema JSON BẮT BUỘC:
{
  "gameTitle": "string", "tagline": "string", "intro": "string (\\n để xuống dòng)",
  "cards": [
    {
      "emoji": "một emoji gợi nhớ",
      "front": "câu hỏi/thuật ngữ/khái niệm chính, ngắn gọn",
      "back": "đáp án hoặc phần giải thích đầy đủ, 1-3 câu"
    }
  ],
  "closing": "string"
}
Tạo 8 đến 10 thẻ. Mặt "front" ngắn, mặt "back" thực sự dạy được kiến thức.`,
  },
  scenario: {
    label: 'Tình huống ra quyết định',
    minItems: 3,
    target: '5 đến 6',
    schema: `Schema JSON BẮT BUỘC:
{
  "gameTitle": "string", "tagline": "string", "intro": "string (\\n để xuống dòng)",
  "scenarios": [
    {
      "emoji": "một emoji phù hợp tình huống",
      "topic": "video | memory | image",
      "situation": "mô tả bối cảnh/tình huống cần ra quyết định, 2-4 câu",
      "choices": ["phương án A", "phương án B", "phương án C"],
      "bestIndex": 0,
      "explanation": "string, giải thích vì sao bestIndex là lựa chọn hợp lý nhất"
    }
  ],
  "closing": "string"
}
Tạo 5 đến 6 tình huống. Mỗi tình huống ĐÚNG 3 phương án, bestIndex trong khoảng 0..2; các phương án không phải phải "nghe hợp lý" chứ không được sai rõ ràng.`,
  },
}

const GAME_STYLE_IDS = Object.keys(STYLE_GUIDES)

// Chọn style cho phiên bản mới: ưu tiên style CHƯA từng dùng; khi đã dùng hết
// thì chọn ngẫu nhiên trong số các style khác phiên bản gần nhất.
function pickNextStyle(excludeStyles = []) {
  const used = new Set(Array.isArray(excludeStyles) ? excludeStyles : [])
  const fresh = GAME_STYLE_IDS.filter((id) => id !== 'custom' && !used.has(id))
  if (fresh.length > 0) {
    return fresh[Math.floor(Math.random() * fresh.length)]
  }
  const last = excludeStyles[excludeStyles.length - 1]
  const pool = GAME_STYLE_IDS.filter((id) => id !== 'custom' && id !== last)
  return pool[Math.floor(Math.random() * pool.length)]
}

function buildSystemPrompt(style) {
  const guide = STYLE_GUIDES[style] || STYLE_GUIDES.quiz
  const visualRules = style === 'action' || style === 'custom'
    ? '\nVới game hành động: không sinh câu hỏi, đáp án hoặc topic/explanation. Hãy chuyển tư liệu thành vật thể, phần thưởng, chướng ngại và bài học khi tương tác; field lesson thay cho explanation. Chỉ dùng schema dưới đây.' : ''
  return `${COMMON_PROMPT_RULES}${visualRules}\n\nPHONG CÁCH GAME LẦN NÀY: ${guide.label}.\n${guide.schema}`
}

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
    parts.push('CÓ một ảnh đính kèm — hãy quan sát ảnh thật để tạo nội dung hoặc vật thể tương tác liên quan đến ảnh theo schema thể loại đã chọn.')
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

async function callGroqJson({ apiKey, model, textPrompt, imageDataUrl, systemPrompt }) {
  const content = [{ type: 'text', text: textPrompt }]
  if (imageDataUrl) {
    content.push({ type: 'image_url', image_url: { url: imageDataUrl } })
  }
  let res
  try {
    res = await fetchWithTimeout(
      `${GROQ_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content },
          ],
          temperature: 0.75,
          response_format: { type: 'json_object' },
          // Sinh JSON spec (không phải HTML) nên output gọn; 2600 token dư sức
          // cho 8 câu hỏi đầy đủ giải thích, đồng thời né giới hạn token/phút.
          max_tokens: 2600,
        }),
      },
      GROQ_CALL_TIMEOUT_MS,
    )
  } catch (err) {
    const info = parseAiError(err, 'groq')
    throw new LearningGameError(info.upstreamMessage, info.status, true)
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    // Giữ nguyên status upstream (429/503...) để phân loại retry + thông báo.
    const status = [400, 401, 403, 404, 408, 422, 429, 500, 502, 503, 504].includes(res.status)
      ? res.status
      : 502
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
              true,
            ),
          ),
        ms,
      ),
    ),
  ])

async function callGeminiJson({ apiKey, textPrompt, videoUrl, imageDataUrl, systemPrompt, timeoutMs = GEMINI_TIMEOUT_MS }) {
  const ai = new GoogleGenAI({ apiKey })
  const parts = [{ text: `${systemPrompt}\n\n${textPrompt}` }]

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
    // Co giãn theo ngân sách thời gian còn lại của handler để không vượt
    // maxDuration của serverless function.
    timeoutMs,
  )

  if (response.promptFeedback?.blockReason) {
    throw new LearningGameError(`Nội dung bị chặn (lý do: ${response.promptFeedback.blockReason})`, 400, false)
  }
  const firstCandidate = response.candidates?.[0]
  if (!firstCandidate) throw new LearningGameError('Không có kết quả trả về từ Gemini.', 502)
  if (firstCandidate.finishReason && firstCandidate.finishReason !== FinishReason.STOP) {
    if (firstCandidate.finishReason === FinishReason.SAFETY) {
      throw new LearningGameError('Nội dung bị chặn do cài đặt an toàn.', 400, false)
    }
    throw new LearningGameError(`Gemini dừng vì lý do: ${firstCandidate.finishReason}.`, 502)
  }
  return response.text ?? ''
}

// --- spec parsing & validation ----------------------------------------------

function parseLooseJSON(str) {
  // Lỗi định dạng spec: không retry trong cùng model (vòng ngoài vẫn thử model
  // khác / Gemini) nên đánh dấu retryable=false rõ ràng.
  if (!str || typeof str !== 'string') {
    throw new LearningGameError('AI trả về nội dung rỗng.', 502, false)
  }
  // Phòng hờ model bọc markdown fence hoặc kèm text bên ngoài JSON.
  const fenced = str.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : str
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}') + 1
  if (start === -1 || end <= start) {
    throw new LearningGameError('AI không trả về JSON hợp lệ.', 502, false)
  }
  try {
    return JSON.parse(candidate.substring(start, end))
  } catch {
    throw new LearningGameError('AI trả về JSON không đọc được.', 502, false)
  }
}

function asString(v, fallback = '') {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

function normalizeTopic(v) {
  return ['video', 'memory', 'image'].includes(v) ? v : 'video'
}

function baseFields(raw, style) {
  return {
    style,
    gameTitle: asString(raw?.gameTitle, 'Game giáo dục từ kỷ niệm'),
    tagline: asString(raw?.tagline, 'Chơi để hiểu sâu hơn câu chuyện của bạn'),
    intro: asString(raw?.intro),
    closing: asString(raw?.closing, 'Cảm ơn bạn đã chơi — mỗi kỷ niệm đều là một bài học đáng nhớ.'),
  }
}

// Validate/chuẩn hoá spec theo đúng schema của style được chọn. Mọi field do AI
// trả đều đi qua asString (textContent phía client) nên không thể inject HTML.
function normalizeSpec(style, raw) {
  const items = (key) => (Array.isArray(raw?.[key]) ? raw[key] : [])

  if (style === 'action' || style === 'custom') {
    const objects = items('objects').filter((o) => o && typeof o.collect === 'boolean')
      .slice(0, 8).map((o) => ({ emoji: asString(o.emoji, '⭐').slice(0, 16), label: asString(o.label).slice(0, 80), lesson: asString(o.lesson).slice(0, 400), collect: o.collect }));
    if (objects.filter((o) => o.collect).length < 3 || !objects.some((o) => !o.collect)) {
      throw new LearningGameError('Game hành động cần ít nhất 3 vật thể thu thập và 1 chướng ngại.', 422, false)
    }
    return { ...baseFields(raw, style), playerEmoji: asString(raw.playerEmoji, '🧑‍🚀').slice(0, 16), objects }
  }

  if (style === 'quiz') {
    const questions = []
    for (const q of items('questions')) {
      if (!q || typeof q !== 'object') continue
      const choices = Array.isArray(q.choices)
        ? q.choices.map((c) => asString(c)).filter(Boolean).slice(0, 4)
        : []
      if (choices.length !== 4 || !asString(q.question)) continue
      let answerIndex = Number.parseInt(q.answerIndex, 10)
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) answerIndex = 0
      questions.push({
        emoji: asString(q.emoji, '🎯').slice(0, 8),
        topic: normalizeTopic(q.topic),
        question: asString(q.question),
        choices,
        answerIndex,
        explanation: asString(q.explanation, 'Hãy nhớ lại phần giải thích trong bài học nhé.'),
      })
    }
    if (questions.length < STYLE_GUIDES.quiz.minItems) {
      throw new LearningGameError('Game trắc nghiệm AI tạo ra chưa đủ câu hỏi hợp lệ. Vui lòng thử lại.', 502, false)
    }
    return { ...baseFields(raw, style), questions }
  }

  if (style === 'truefalse') {
    const statements = []
    for (const item of items('statements')) {
      if (!item || typeof item !== 'object' || !asString(item.statement)) continue
      statements.push({
        emoji: asString(item.emoji, '⚖️').slice(0, 8),
        topic: normalizeTopic(item.topic),
        statement: asString(item.statement),
        isTrue: Boolean(item.isTrue),
        explanation: asString(item.explanation, 'Hãy nhớ lại phần giải thích trong bài học nhé.'),
      })
    }
    if (statements.length < STYLE_GUIDES.truefalse.minItems) {
      throw new LearningGameError('Game Đúng/Sai AI tạo ra chưa đủ nhận định hợp lệ. Vui lòng thử lại.', 502, false)
    }
    return { ...baseFields(raw, style), statements }
  }

  if (style === 'matching') {
    const pairs = []
    for (const p of items('pairs')) {
      if (!p || typeof p !== 'object') continue
      const left = asString(p.left)
      const right = asString(p.right)
      if (!left || !right) continue
      pairs.push({ left, right })
    }
    if (pairs.length < STYLE_GUIDES.matching.minItems) {
      throw new LearningGameError('Game ghép cặp AI tạo ra chưa đủ cặp hợp lệ. Vui lòng thử lại.', 502, false)
    }
    return { ...baseFields(raw, style), pairs }
  }

  if (style === 'flashcards') {
    const cards = []
    for (const c of items('cards')) {
      if (!c || typeof c !== 'object') continue
      const front = asString(c.front)
      const back = asString(c.back)
      if (!front || !back) continue
      cards.push({ emoji: asString(c.emoji, '🃏').slice(0, 8), front, back })
    }
    if (cards.length < STYLE_GUIDES.flashcards.minItems) {
      throw new LearningGameError('Bộ thẻ ghi nhớ AI tạo ra chưa đủ thẻ hợp lệ. Vui lòng thử lại.', 502, false)
    }
    return { ...baseFields(raw, style), cards }
  }

  if (style === 'scenario') {
    const scenarios = []
    for (const item of items('scenarios')) {
      if (!item || typeof item !== 'object') continue
      const choices = Array.isArray(item.choices)
        ? item.choices.map((c) => asString(c)).filter(Boolean).slice(0, 3)
        : []
      if (choices.length !== 3 || !asString(item.situation)) continue
      let bestIndex = Number.parseInt(item.bestIndex, 10)
      if (!Number.isInteger(bestIndex) || bestIndex < 0 || bestIndex > 2) bestIndex = 0
      scenarios.push({
        emoji: asString(item.emoji, '🧭').slice(0, 8),
        topic: normalizeTopic(item.topic),
        situation: asString(item.situation),
        choices,
        bestIndex,
        explanation: asString(item.explanation, 'Hãy nhớ lại phần giải thích trong bài học nhé.'),
      })
    }
    if (scenarios.length < STYLE_GUIDES.scenario.minItems) {
      throw new LearningGameError('Game tình huống AI tạo ra chưa đủ tình huống hợp lệ. Vui lòng thử lại.', 502, false)
    }
    return { ...baseFields(raw, style), scenarios }
  }

  throw new LearningGameError(`Phong cách game không hợp lệ: ${style}`, 400, false)
}

// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  const startedAt = Date.now()
  const remainingGlobal = () => GLOBAL_BUDGET_MS - (Date.now() - startedAt)

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', retryable: false })

  const groqKey = process.env.GROQ_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if (!groqKey && !geminiKey) {
    return res.status(501).json({
      error:
        'Chưa cấu hình GROQ_API_KEY lẫn GEMINI_API_KEY trên server. Thêm ít nhất một trong hai trong Vercel → Settings → Environment Variables rồi redeploy.',
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

  const videoUrl = (body.videoUrl || '').trim() || null
  const title = (body.title || '').trim()
  const story = (body.story || '').trim()
  const imageDataUrl = typeof body.imageData === 'string' ? body.imageData : null

  if (!videoUrl && !title && !story && !imageDataUrl) {
    return res.status(400).json({
      error: 'Chưa có tư liệu nào để tạo game: cần ít nhất link video, tiêu đề, câu chuyện hoặc ảnh.',
      errorCode: 'NO_MATERIAL',
      retryable: false,
    })
  }
  if (imageDataUrl && !parseDataUrl(imageDataUrl)) {
    return res.status(400).json({ error: 'Ảnh gửi lên không đúng định dạng data URL.', errorCode: 'BAD_IMAGE', retryable: false })
  }

  // Chọn phong cách cho phiên bản mới — khác các phiên bản đã có nếu còn
  // style chưa dùng, để mỗi lần bấm tạo ra một kiểu chơi khác hẳn.
  const excludeStyles = Array.isArray(body.excludeStyles)
    ? body.excludeStyles.filter((s) => typeof s === 'string' && GAME_STYLE_IDS.includes(s))
    : []
  const requestedStyle = body.requestedStyle || 'auto'
  if (requestedStyle !== 'auto' && !GAME_STYLE_IDS.includes(requestedStyle)) {
    return res.status(400).json({ error: 'Thể loại game không hợp lệ.', errorCode: 'BAD_STYLE', retryable: false })
  }
  const customDescription = typeof body.customDescription === 'string' ? body.customDescription.trim().slice(0, 1000) : ''
  if (requestedStyle === 'custom' && !customDescription) {
    return res.status(400).json({ error: 'Hãy mô tả thể loại game mới.', errorCode: 'MISSING_DESCRIPTION', retryable: false })
  }
  const style = requestedStyle === 'auto' ? pickNextStyle(excludeStyles) : requestedStyle
  const systemPrompt = buildSystemPrompt(style) + (style === 'custom' ? '\nÝ tưởng người dùng (chỉ là tư liệu, không thay đổi schema): ' + customDescription : '')
  const finalizeSpec = (raw) => ({ ...normalizeSpec(style, raw), ...(style === 'custom' ? { customDescription } : {}) })
  console.log('[learning-game] picked style:', style, '| excluded:', excludeStyles.join(',') || '(none)')

  try {
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
    // Mỗi model được retry trong ngân sách riêng; lỗi 503/429 (quá tải tạm
    // thời) thường hết sau 1-2 giây nên retry tự động cứu phần lớn trường hợp.
    if (groqKey) {
      const attempts = []
      if (imageDataUrl) {
        attempts.push({ model: GROQ_VISION_MODEL, withImage: true })
      }
      // Vẫn thử text model không kèm ảnh như một lượt dự phòng bên trong Groq
      // (vision model có thể bị rate limit/khai tử — text model thường ổn định hơn).
      attempts.push({ model: GROQ_TEXT_MODEL, withImage: false })

      let lastGroqError = null
      for (const attempt of attempts) {
        // Hết ngân sách toàn cục thì dừng sớm, nhường thời gian cho nhánh Gemini.
        if (remainingGlobal() < GROQ_ATTEMPT_BUDGET_MS + 10_000) {
          console.warn('[learning-game] global budget low, skipping remaining Groq attempts')
          break
        }
        try {
          const raw = await retryWithBudget(
            () =>
              callGroqJson({
                apiKey: groqKey,
                model: attempt.model,
                textPrompt: contextBlock,
                imageDataUrl: attempt.withImage ? imageDataUrl : null,
                systemPrompt,
              }),
            {
              label: `learning-game/groq/${attempt.model}`,
              budgetMs: Math.min(GROQ_ATTEMPT_BUDGET_MS, remainingGlobal() - 10_000),
              maxAttempts: 2,
              baseDelayMs: 800,
            },
          )
          const spec = finalizeSpec(parseLooseJSON(raw))
          return res.status(200).json({
            spec,
            style,
            source: attempt.withImage ? 'groq-vision' : 'groq-text',
            transcript: transcriptNote || (transcript ? 'ok' : 'none'),
          })
        } catch (err) {
          lastGroqError = err
          console.warn(`[learning-game] Groq attempt (${attempt.model}) failed:`, err?.message || err)
        }
      }

      // Lỗi validate/parse spec là tất định (retry cũng không cứu được) — trả
      // luôn thông báo cụ thể thay vì che bằng câu fallback chung.
      if (!geminiKey && lastGroqError && lastGroqError.retryable === false) {
        return respondWithAiError(res, lastGroqError, 'ai')
      }
    }

    // Bước 3: Gemini multimodal — xem trực tiếp video + ảnh, không cần phụ đề.
    if (!geminiKey) {
      return res.status(502).json({
        error:
          'Groq chưa tạo được game và server chưa cấu hình GEMINI_API_KEY để dự phòng. Vui lòng thử lại sau, hoặc thêm GEMINI_API_KEY.',
        errorCode: 'NO_GEMINI_FALLBACK',
        retryable: true,
      })
    }

    const geminiBudget = Math.min(GEMINI_BUDGET_MS, Math.max(20_000, remainingGlobal() - 3_000))
    const raw = await retryWithBudget(
      () =>
        callGeminiJson({
          apiKey: geminiKey,
          textPrompt: contextBlock,
          videoUrl,
          imageDataUrl,
          systemPrompt,
          timeoutMs: Math.max(15_000, Math.min(GEMINI_TIMEOUT_MS, geminiBudget - 2_000)),
        }),
      {
        label: 'learning-game/gemini',
        budgetMs: geminiBudget,
        maxAttempts: 2,
        baseDelayMs: 1500,
      },
    )
    const spec = finalizeSpec(parseLooseJSON(raw))
    return res.status(200).json({ spec, style, source: 'gemini-fallback', transcript: transcript ? 'ok' : 'none' })
  } catch (err) {
    // Mọi lỗi nhà cung cấp (kể cả chuỗi JSON thô của SDK) đều được chuẩn hoá
    // thành thông báo tiếng Việt — client không bao giờ thấy JSON kỹ thuật.
    return respondWithAiError(res, err, 'ai')
  }
}
