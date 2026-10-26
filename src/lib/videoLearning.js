// src/lib/videoLearning.js
//
// "Tạo trang học tập từ video" — ported từ pattern trong
// ai-doctor-admin/src/video-to-learning-khanh (lib/prompts.ts + lib/parse.ts
// + lib/textGeneration.ts), rút gọn cho Mindstamps: chỉ cần bước sinh JSON
// spec (không có bước sinh code HTML tiếp theo như bản gốc), vì nút bấm
// trong CreateMemory chỉ cần tạo JSON cho trang lập trình học tập, không
// cần render preview app ngay tại đây.
//
// Gọi qua /api/video-to-learning (Vercel Serverless Function, xem
// api/video-to-learning.js) — KHÔNG gọi thẳng Groq từ client, vì key sẽ bị
// lộ qua biến VITE_ (xem ghi chú trong ai-doctor-admin/.../textGeneration.ts
// giải thích lý do đổi sang proxy server-side).

export const SPEC_FROM_VIDEO_PROMPT = `You are a pedagogist and product designer with deep expertise in crafting engaging learning experiences via interactive web apps.

Examine the contents of the attached video. Then, write a detailed and carefully considered spec for an interactive web app designed to complement the video and reinforce its key idea or ideas. The recipient of the spec does not have access to the video, so the spec must be thorough and self-contained (the spec must not mention that it is based on a video). Here is an example of a spec written in response to a video about functional harmony:

"In music, chords create expectations of movement toward certain other chords and resolution towards a tonal center. This is called functional harmony.

Build me an interactive web app to help a learner understand the concept of functional harmony.

SPECIFICATIONS:
1. The app must feature an interactive keyboard.
2. The app must showcase all 7 diatonic triads that can be created in a major key (i.e., tonic, supertonic, mediant, subdominant, dominant, submediant, leading chord).
3. The app must somehow describe the function of each of the diatonic triads, and state which other chords each triad tends to lead to.
4. The app must provide a way for users to play different chords in sequence and see the results.
[etc.]"

The goal of the app that is to be built based on the spec is to enhance understanding through simple and playful design. The provided spec should not be overly complex, i.e., a junior web developer should be able to implement it in a single html file (with all styles and scripts inline). Most importantly, the spec must clearly outline the core mechanics of the app, and those mechanics must be highly effective in reinforcing the given video's key idea(s).

Provide the result as a JSON object containing a single field called "spec", whose value is the spec for the web app.`;

export function parseJSON(str) {
  const start = str.indexOf('{');
  const end = str.lastIndexOf('}') + 1;
  return JSON.parse(str.substring(start, end));
}

export class VideoLearningError extends Error {}

// Server hiện đã luôn trả thông báo tiếng Việt thân thiện; hàm này là lớp
// phòng thủ cuối cùng: nếu lỡ còn sót chuỗi JSON kỹ thuật / câu lỗi tiếng Anh
// của nhà cung cấp AI thì thay bằng câu chung dễ hiểu, không bao giờ hiển thị
// nguyên cụm {"error":...} như sự cố 503 UNAVAILABLE đã gặp (27/10/2026).
export function sanitizeAiErrorMessage(message) {
  const raw = String(message || '').trim();
  if (!raw) return 'Đã có lỗi khi gọi máy chủ AI. Vui lòng thử lại sau ít giây.';
  const looksRawTechnical =
    /^[\s]*[{[]/.test(raw) ||
    /"code"\s*:|"status"\s*:|"message"\s*:/.test(raw) ||
    /\b(UNAVAILABLE|INTERNAL|INVALID_ARGUMENT|DEADLINE_EXCEEDED|rate limit|overloaded|high demand)\b/i.test(raw);
  if (looksRawTechnical) {
    return 'Mô hình AI đang quá tải hoặc tạm gián đoạn. Vui lòng đợi vài giây rồi bấm thử lại.';
  }
  return raw;
}

/**
 * Gọi backend để lấy transcript video (YouTube) + sinh spec (JSON) qua Groq.
 * @param {string} videoUrl
 * @returns {Promise<{ spec: string, source?: string }>}
 */
export async function generateLearningPageSpec(videoUrl) {
  const res = await fetch('/api/video-to-learning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, prompt: SPEC_FROM_VIDEO_PROMPT }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new VideoLearningError(sanitizeAiErrorMessage(data?.error || `Lỗi máy chủ (${res.status})`));
  }

  let spec;
  try {
    spec = parseJSON(data.text ?? '').spec;
  } catch {
    throw new VideoLearningError('AI trả về dữ liệu không đúng định dạng JSON mong đợi. Bấm thử lại nhé.');
  }
  if (!spec) {
    throw new VideoLearningError('Không nhận được nội dung spec từ AI. Vui lòng thử lại.');
  }

  return { spec, source: data.source };
}
