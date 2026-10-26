// api/_lib/aiErrors.js
//
// Shared error handling for the AI serverless functions
// (api/video-to-learning.js, api/learning-game.js).
//
// Vấn đề thực tế gặp phải (27/10/2026): Gemini trả 503 UNAVAILABLE do quá
// tải, SDK @google/genai ném Error với message là NGUYÊN CHUỖI JSON
// '{"error":{"code":"503","message":"...","status":"UNAVAILABLE"}}', endpoint
// cũ truyền thẳng chuỗi này ra client -> người dùng thấy JSON kỹ thuật tiếng
// Anh. File này:
//   1. parseAiError() — chuẩn hoá MỌI dạng lỗi (Groq fetch, Gemini SDK,
//      timeout, mạng) thành { status, code, upstreamMessage, retryable }.
//   2. friendlyAiMessage() — map sang câu tiếng Việt thân thiện, không lộ
//      JSON/máy chủ.
//   3. retryWithBudget() — thử lại tự động trong NGÂN SÁCH THỜI GIAN cố định
//      (bài học từ ai-doctor-admin: không stack nhiều timeout đầy đủ kẻo vượt
//      maxDuration của Vercel và bị cắt ngang 504).
//   4. fetchWithTimeout() — AbortController cho các lệnh fetch AI.

export const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

export function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(Number(status))
}

/**
 * Chuẩn hoá một lỗi bất kỳ về dạng có cấu trúc.
 * @param {unknown} err
 * @param {string} provider 'groq' | 'gemini' | 'ai'
 */
export function parseAiError(err, provider = 'ai') {
  let status = Number(err?.status) || Number(err?.statusCode) || Number(err?.code) || 502
  let code = String(err?.code || err?.status || '')
  let upstreamMessage = err?.message ? String(err.message) : String(err)

  // SDK @google/genai (và vài nhánh fetch) nhét nguyên JSON body của nhà cung
  // cấp vào message — thử parse để lấy code/status/message thật bên trong.
  if (upstreamMessage.trim().startsWith('{') || upstreamMessage.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(upstreamMessage)
      const inner = parsed?.error && typeof parsed.error === 'object' ? parsed.error : parsed
      if (inner && typeof inner === 'object') {
        if (inner.code) {
          const n = Number(inner.code)
          if (Number.isFinite(n)) status = n
          code = String(inner.code)
        }
        if (inner.status) code = String(inner.status)
        if (inner.message) upstreamMessage = String(inner.message)
      }
    } catch {
      // Không parse được thì giữ nguyên message thô.
    }
  }

  // Mạng/timeout: fetch ném TypeError ("fetch failed"), AbortController ném
  // AbortError, SDK có thể trả chuỗi "timeout"/"network error".
  const name = String(err?.name || '')
  if (
    name === 'AbortError' ||
    /timeout|timed out|fetch failed|network|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(upstreamMessage)
  ) {
    status = 504
    if (!code || code === String(err?.code || '')) code = code || 'TIMEOUT_OR_NETWORK'
  }

  // Lỗi do code của ta đánh dấu rõ không nên retry (vd spec AI trả về hỏng)
  // thì tôn trọng cờ đó; còn lại suy ra từ HTTP status.
  const retryable = err?.retryable === false ? false : isRetryableStatus(status)

  return { status, code, upstreamMessage, retryable, provider }
}

/**
 * Câu thông báo tiếng Việt hiển thị cho người dùng cuối — không bao giờ trả về
 * JSON/chuỗi kỹ thuật thô.
 */
const VIETNAMESE_DIACRITICS =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

export function friendlyAiMessage(info) {
  const status = Number(info?.status)
  const code = String(info?.code || '').toUpperCase()

  // Thông báo do chính code mình soạn (tiếng Việt, không phải JSON thô) thì
  // giữ nguyên — chi tiết và thân thiện hơn câu generic; thông báo nhà cung
  // cấp là tiếng Anh nên luôn được thay bằng câu map bên dưới.
  if (
    info?.upstreamMessage &&
    VIETNAMESE_DIACRITICS.test(info.upstreamMessage) &&
    !info.upstreamMessage.trim().startsWith('{')
  ) {
    return info.upstreamMessage
  }

  if (status === 429 || code.includes('RATE_LIMIT') || code === 'OVERLOADED') {
    return 'Máy chủ AI đang nhận quá nhiều yêu cầu cùng lúc. Vui lòng đợi khoảng 10–20 giây rồi bấm thử lại.'
  }
  if (status === 503 || code === 'UNAVAILABLE') {
    return 'Mô hình AI hiện đang quá tải tạm thời (lỗi 503). Sự cố này thường hết sau vài giây — vui lòng bấm thử lại.'
  }
  if (status === 504 || code === 'TIMEOUT_OR_NETWORK' || code === 'DEADLINE_EXCEEDED') {
    return 'Kết nối tới máy chủ AI bị gián đoạn hoặc xử lý quá lâu. Hãy thử lại, hoặc dùng video ngắn/gọn hơn.'
  }
  if (status === 400 || code === 'INVALID_ARGUMENT') {
    // Thông báo tiếng Việt tự soạn đã được giữ lại ở đầu hàm; còn lại là chuỗi
    // kỹ thuật tiếng Anh của nhà cung cấp -> thay bằng câu chung.
    return 'Yêu cầu gửi tới AI không hợp lệ. Hãy kiểm tra lại link video và nội dung rồi thử lại.'
  }
  if (code === 'SAFETY' || /safety|blocked|blockReason/i.test(info?.upstreamMessage || '')) {
    return 'Nội dung bị nhà cung cấp AI chặn do cài đặt an toàn. Hãy thử video hoặc tư liệu khác.'
  }
  if (status === 401 || status === 403) {
    return 'Server chưa cấu hình đúng khoá API AI. Vui lòng liên hệ quản trị viên để kiểm tra GROQ_API_KEY/GEMINI_API_KEY.'
  }
  return 'Đã có lỗi khi gọi máy chủ AI. Vui lòng bấm thử lại sau ít giây; nếu lỗi liên tục, hãy thử video khác.'
}

/**
 * Tiện ích trả về response lỗi chuẩn cho mọi endpoint.
 * @param {import('http').ServerResponse} res
 * @param {unknown} err
 * @param {string} provider
 */
export function respondWithAiError(res, err, provider = 'ai') {
  const info = parseAiError(err, provider)
  const message = friendlyAiMessage(info)
  console.warn(`[ai-error:${provider}]`, info.status, info.code, '-', info.upstreamMessage?.slice(0, 200))
  return res.status(info.status).json({
    error: message,
    errorCode: info.code || String(info.status),
    retryable: info.retryable,
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Chạy fn với retry tự động, TỔNG thời gian (kể cả delay + các attempt) không
 * vượt budgetMs — tránh lỗi 504 do Vercel cắt ngang hàm serverless. Chỉ retry
 * với lỗi tạm thời (429/5xx/mạng) và khi vẫn còn đủ ngân sách tối thiểu cho
 * một lượt thử nghiêm túc.
 *
 * @template T
 * @param {(attempt: number) => Promise<T>} fn
 * @param {{ label?: string, budgetMs?: number, baseDelayMs?: number, maxAttempts?: number, minAttemptBudgetMs?: number }} opts
 * @returns {Promise<T>}
 */
export async function retryWithBudget(
  fn,
  { label = 'ai', budgetMs = 45_000, baseDelayMs = 700, maxAttempts = 3, minAttemptBudgetMs = 8_000 } = {},
) {
  const startedAt = Date.now()
  let lastErr

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastErr = err
      const info = parseAiError(err, label)
      if (!info.retryable || attempt === maxAttempts) throw err

      const elapsed = Date.now() - startedAt
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 4_000)
      const remaining = budgetMs - elapsed
      if (remaining < delay + minAttemptBudgetMs) {
        console.warn(`[${label}] hết ngân sách retry (còn ${remaining}ms), trả lỗi sau ${attempt} lần thử`)
        throw err
      }
      console.warn(`[${label}] lần ${attempt} lỗi ${info.status}/${info.code || '?'} — thử lại sau ${delay}ms`)
      await sleep(delay)
    }
  }
  throw lastErr
}

/**
 * fetch có timeout cứng bằng AbortController; lỗi timeout bị biến đổi thành
 * lỗi 504 retryable qua parseAiError().
 */
export function fetchWithTimeout(url, options = {}, timeoutMs = 45_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}
