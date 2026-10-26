// src/lib/learningGame.js
//
// "Tạo game giáo dục" — client counterpart của api/learning-game.js.
//
// Luồng dữ liệu (bám theo pattern BringAnyIdeaToLifePanel ở ai-doctor-admin3:
// AI tạo sản phẩm, client nhúng trong iframe có "tap-to-load" gate):
//   1. Nén ảnh memory xuống kích thước đủ nhỏ để gửi qua serverless function
//      (giới hạn body ~4.5MB) và rẻ token vision.
//   2. Gọi /api/learning-game với videoUrl + title + story + ảnh -> nhận
//      JSON game spec (đã validate ở server).
//   3. renderLearningGameHtml() biến spec thành MỘT file HTML/CSS/JS tự chứa
//      (không tài nguyên ngoài), chơi ngay trong <iframe srcDoc>.
//
// Firestore chỉ lưu spec JSON (nhỏ, field `learningGame`); HTML được render
// tức thời mỗi lần chơi từ spec + ảnh memory hiện tại, nên không bao giờ vượt
// giới hạn 1MB/fied của Firestore.

export class LearningGameError extends Error {}

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
 * @param {{ title?: string, story?: string, videoUrl?: string|null, imageData?: string|null }} input
 * @returns {Promise<{ spec: object, source: string }>}
 */
export async function generateLearningGame({ title = '', story = '', videoUrl = '', imageData = null }) {
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
      }),
    });
  } catch (networkErr) {
    throw new LearningGameError(
      `Không kết nối được tới server tạo game: ${networkErr?.message || 'network error'}. Kiểm tra mạng rồi thử lại.`,
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 504 || res.status === 502 || res.status === 503) {
      throw new LearningGameError(
        'Server xử lý quá lâu và bị nền tảng cắt ngang. Hãy thử lại, hoặc dùng video ngắn/gọn hơn.',
      );
    }
    throw new LearningGameError(data?.error || `Lỗi máy chủ (${res.status})`);
  }
  if (!data?.spec || !Array.isArray(data.spec.questions) || data.spec.questions.length === 0) {
    throw new LearningGameError('AI trả về game spec không hợp lệ. Vui lòng thử lại.');
  }
  return { spec: data.spec, source: data.source || 'unknown' };
}

// ---------------------------------------------------------------------------
// Self-contained HTML renderer
// ---------------------------------------------------------------------------

const SOURCE_LABELS = {
  'groq-vision': 'Groq AI (hình ảnh + văn bản)',
  'groq-text': 'Groq AI (văn bản)',
  'gemini-fallback': 'Gemini AI (video + hình ảnh)',
  unknown: 'AI',
};

export function describeGameSource(source) {
  return SOURCE_LABELS[source] || 'AI';
}

function safeJson(obj) {
  // Nhồi JSON an toàn vào <script>: tránh đóng thẻ sớm và ký tự dòng đặc biệt.
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Build a complete, offline-capable single-file HTML game from a validated
 * spec. The only injected data is one JSON blob (all dynamic text goes
 * through textContent at runtime), so untrusted AI text can't inject markup.
 *
 * @param {object} spec
 * @param {{ coverImage?: string|null, memoryTitle?: string, source?: string }} opts
 * @returns {string} full HTML document
 */
export function renderLearningGameHtml(spec, { coverImage = null, memoryTitle = '', source = '' } = {}) {
  const runtime = {
    gameTitle: spec.gameTitle,
    tagline: spec.tagline,
    intro: spec.intro,
    questions: spec.questions,
    closing: spec.closing,
    coverImage: coverImage || null,
    memoryTitle: memoryTitle || '',
    sourceLabel: describeGameSource(source),
    generatedAt: new Date().toLocaleString('vi-VN'),
  };

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${runtime.gameTitle.replace(/[<>&"]/g, '')} — Mindstamps Learning Game</title>
<style>
  :root{
    --cream:#faf7f2; --beige:#f5f1ea; --brown:#8b7355; --deep:#5d4e37;
    --sage:#9caf88; --sage-dark:#7a8a6b; --rose:#d4a574; --paper:#fefcf8;
    --ink:#2c2416; --good:#5f8a5b; --bad:#c2685a;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;height:100%;}
  body{
    font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    color:var(--ink);
    background:linear-gradient(160deg,var(--cream) 0%,var(--beige) 100%);
    overflow:hidden;
  }
  #app{height:100dvh;display:flex;flex-direction:column;max-width:680px;margin:0 auto;width:100%;}
  .screen{flex:1;display:flex;flex-direction:column;padding:20px 18px;overflow-y:auto;min-height:0;}
  .hidden{display:none !important;}
  .card{
    background:var(--paper);border-radius:20px;padding:20px;
    box-shadow:0 10px 25px rgba(139,115,85,.15),0 6px 12px rgba(139,115,85,.1);
  }
  .kicker{font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:var(--brown);font-weight:700;}
  h1{font-family:Georgia,'Crimson Text',serif;font-size:clamp(24px,5vw,34px);color:var(--deep);margin:8px 0 6px;line-height:1.2;}
  .tagline{color:var(--brown);font-size:14px;margin:0 0 14px;}
  .cover{width:100%;max-height:210px;object-fit:cover;border-radius:16px;margin-bottom:14px;box-shadow:0 8px 20px rgba(93,78,55,.18);}
  .cover-placeholder{
    width:100%;height:120px;border-radius:16px;margin-bottom:14px;
    display:flex;align-items:center;justify-content:center;font-size:46px;
    background:linear-gradient(135deg,#efe6d8,#e3d6c2);
  }
  .intro{white-space:pre-wrap;line-height:1.65;font-size:14.5px;color:var(--ink);background:var(--cream);
    border-left:4px solid var(--rose);padding:12px 14px;border-radius:0 12px 12px 0;margin:0 0 16px;}
  .memory-ref{font-size:12.5px;color:var(--brown);font-style:italic;margin:0 0 16px;}
  .btn{
    appearance:none;border:none;cursor:pointer;font-family:inherit;font-weight:600;
    border-radius:999px;padding:14px 26px;font-size:15px;transition:transform .15s,box-shadow .15s,opacity .15s;
    min-height:48px;width:100%;
  }
  .btn-primary{background:linear-gradient(135deg,var(--sage) 0%,var(--sage-dark) 100%);color:#fff;
    box-shadow:0 4px 12px rgba(156,175,136,.4);}
  .btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(156,175,136,.5);}
  .btn-warm{background:linear-gradient(135deg,var(--rose) 0%,var(--brown) 100%);color:#fff;
    box-shadow:0 4px 12px rgba(212,165,116,.35);}
  .btn-warm:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(212,165,116,.45);}
  .btn:disabled{opacity:.45;cursor:not-allowed;transform:none;}
  .meta{margin-top:auto;padding-top:14px;font-size:11px;color:var(--brown);text-align:center;}
  /* progress */
  .progress-wrap{padding:14px 4px 10px;flex-shrink:0;}
  .progress-top{display:flex;justify-content:space-between;font-size:12.5px;color:var(--brown);font-weight:600;margin-bottom:6px;}
  .progress-track{height:8px;border-radius:99px;background:#e7ddcd;overflow:hidden;}
  .progress-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--sage),var(--sage-dark));
    transition:width .35s ease;}
  .q-emoji{font-size:34px;text-align:center;margin:6px 0 10px;}
  .q-text{font-family:Georgia,serif;font-size:clamp(17px,3.4vw,21px);color:var(--deep);line-height:1.45;margin:0 0 16px;font-weight:600;}
  .topic-badge{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
    padding:3px 10px;border-radius:99px;background:var(--beige);color:var(--brown);margin-bottom:10px;}
  .choices{display:flex;flex-direction:column;gap:10px;}
  .choice{
    text-align:left;width:100%;padding:13px 16px;border-radius:14px;border:2px solid #e7ddcd;
    background:var(--paper);font-size:14.5px;font-family:inherit;color:var(--ink);cursor:pointer;
    transition:border-color .15s,background .15s,transform .1s;line-height:1.45;
    display:flex;gap:10px;align-items:flex-start;
  }
  .choice:hover:not(:disabled){border-color:var(--rose);}
  .choice:active{transform:scale(.99);}
  .choice .letter{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--beige);color:var(--deep);
    font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;}
  .choice.correct{border-color:var(--good);background:#eef5ec;}
  .choice.correct .letter{background:var(--good);color:#fff;}
  .choice.wrong{border-color:var(--bad);background:#fbeae7;}
  .choice.wrong .letter{background:var(--bad);color:#fff;}
  .choice:disabled{cursor:default;opacity:.92;}
  .explain{
    margin-top:14px;padding:12px 14px;border-radius:12px;font-size:13.5px;line-height:1.6;
    background:#f3ede2;border:1px solid #e2d6c4;color:var(--deep);white-space:pre-wrap;
  }
  .explain strong{display:block;margin-bottom:4px;}
  .next-wrap{margin-top:14px;flex-shrink:0;}
  /* end screen */
  .score-ring{
    width:130px;height:130px;border-radius:50%;margin:8px auto 16px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:conic-gradient(var(--sage) calc(var(--pct)*1%),#e7ddcd 0);
  }
  .score-inner{width:104px;height:104px;border-radius:50%;background:var(--paper);
    display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .score-num{font-size:30px;font-weight:800;color:var(--deep);line-height:1;}
  .score-total{font-size:12px;color:var(--brown);margin-top:2px;}
  .verdict{font-family:Georgia,serif;font-size:19px;color:var(--deep);text-align:center;margin:0 0 10px;font-weight:600;}
  .closing{text-align:center;color:var(--brown);font-size:14px;line-height:1.6;margin:0 0 18px;white-space:pre-wrap;}
  .end-actions{display:flex;flex-direction:column;gap:10px;}
</style>
</head>
<body>
<div id="app">
  <!-- START -->
  <section class="screen" id="screen-start">
    <div class="card" style="margin:auto 0;width:100%;">
      <div class="kicker">🎮 Mindstamps · Game giáo dục</div>
      <h1 id="start-title"></h1>
      <p class="tagline" id="start-tagline"></p>
      <div id="start-cover"></div>
      <p class="memory-ref" id="start-memory"></p>
      <p class="intro" id="start-intro"></p>
      <button class="btn btn-primary" id="start-btn">▶ Bắt đầu chơi</button>
      <div class="meta" id="start-meta"></div>
    </div>
  </section>

  <!-- PLAY -->
  <section class="screen hidden" id="screen-play">
    <div class="progress-wrap">
      <div class="progress-top">
        <span id="progress-label">Câu 1</span>
        <span id="score-label">Điểm: 0</span>
      </div>
      <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
    </div>
    <div class="card" style="width:100%;">
      <span class="topic-badge" id="q-topic"></span>
      <div class="q-emoji" id="q-emoji">🎯</div>
      <p class="q-text" id="q-text"></p>
      <div class="choices" id="q-choices"></div>
      <div class="explain hidden" id="q-explain"></div>
    </div>
    <div class="next-wrap">
      <button class="btn btn-warm hidden" id="next-btn">Tiếp theo →</button>
    </div>
  </section>

  <!-- END -->
  <section class="screen hidden" id="screen-end">
    <div class="card" style="margin:auto 0;width:100%;">
      <div class="kicker" style="text-align:center;">Kết quả</div>
      <div class="score-ring" id="score-ring" style="--pct:0;">
        <div class="score-inner">
          <span class="score-num" id="end-score">0</span>
          <span class="score-total" id="end-total">/ 0</span>
        </div>
      </div>
      <p class="verdict" id="end-verdict"></p>
      <p class="closing" id="end-closing"></p>
      <div class="end-actions">
        <button class="btn btn-primary" id="replay-btn">🔁 Chơi lại</button>
      </div>
    </div>
  </section>
</div>

<script>
const GAME = ${safeJson(runtime)};
const TOPIC_LABELS = { video: 'Từ video', memory: 'Từ kỷ niệm', image: 'Từ hình ảnh' };
const LETTERS = ['A', 'B', 'C', 'D'];

const state = { index: 0, score: 0, answered: false };

const $ = (id) => document.getElementById(id);

function showScreen(name) {
  ['start', 'play', 'end'].forEach((n) => {
    $('screen-' + n).classList.toggle('hidden', n !== name);
  });
}

function renderStart() {
  $('start-title').textContent = GAME.gameTitle || 'Game giáo dục';
  $('start-tagline').textContent = GAME.tagline || '';
  $('start-intro').textContent = GAME.intro || '';
  $('start-memory').textContent = GAME.memoryTitle ? '📖 Kỷ niệm: ' + GAME.memoryTitle : '';
  const cover = $('start-cover');
  if (GAME.coverImage) {
    const img = document.createElement('img');
    img.className = 'cover';
    img.alt = GAME.memoryTitle || 'Ảnh kỷ niệm';
    img.src = GAME.coverImage;
    cover.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'cover-placeholder';
    ph.textContent = '🧭';
    cover.appendChild(ph);
  }
  $('start-meta').textContent = GAME.questions.length + ' câu hỏi · Tạo bởi ' + GAME.sourceLabel + ' · ' + GAME.generatedAt;
}

function renderQuestion() {
  const q = GAME.questions[state.index];
  state.answered = false;

  $('progress-label').textContent = 'Câu ' + (state.index + 1) + ' / ' + GAME.questions.length;
  $('score-label').textContent = 'Điểm: ' + state.score;
  $('progress-fill').style.width = (state.index / GAME.questions.length * 100) + '%';
  $('q-topic').textContent = TOPIC_LABELS[q.topic] || 'Câu hỏi';
  $('q-emoji').textContent = q.emoji || '🎯';
  $('q-text').textContent = q.question;

  const box = $('q-choices');
  box.innerHTML = '';
  q.choices.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.type = 'button';
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.textContent = LETTERS[i];
    const span = document.createElement('span');
    span.textContent = choice;
    btn.appendChild(letter);
    btn.appendChild(span);
    btn.addEventListener('click', () => answer(i, btn));
    box.appendChild(btn);
  });

  const explain = $('q-explain');
  explain.classList.add('hidden');
  explain.innerHTML = '';
  $('next-btn').classList.add('hidden');
  $('next-btn').textContent = state.index === GAME.questions.length - 1 ? 'Xem kết quả 🏁' : 'Tiếp theo →';
}

function answer(choiceIndex) {
  if (state.answered) return;
  state.answered = true;
  const q = GAME.questions[state.index];
  const buttons = Array.from(document.querySelectorAll('.choice'));
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === q.answerIndex) b.classList.add('correct');
    if (i === choiceIndex && i !== q.answerIndex) b.classList.add('wrong');
  });

  const correct = choiceIndex === q.answerIndex;
  if (correct) state.score += 1;
  $('score-label').textContent = 'Điểm: ' + state.score;

  const explain = $('q-explain');
  const strong = document.createElement('strong');
  strong.textContent = correct ? '✅ Chính xác!' : '💡 Chưa đúng — đáp án là ' + LETTERS[q.answerIndex];
  explain.appendChild(strong);
  explain.appendChild(document.createTextNode(q.explanation || ''));
  explain.classList.remove('hidden');
  $('next-btn').classList.remove('hidden');
}

function renderEnd() {
  const total = GAME.questions.length;
  const pct = Math.round(state.score / total * 100);
  $('score-ring').style.setProperty('--pct', pct);
  $('end-score').textContent = state.score;
  $('end-total').textContent = '/ ' + total;
  let verdict;
  if (pct === 100) verdict = '🏆 Xuất sắc! Bạn thuộc bài như in';
  else if (pct >= 70) verdict = '🌟 Rất giỏi! Bạn nắm rất chắc bài học';
  else if (pct >= 40) verdict = '🌱 Tốt lắm! Chơi lại để nhớ sâu hơn nhé';
  else verdict = '📚 Mỗi lần chơi là một lần học — thử lại nào!';
  $('end-verdict').textContent = verdict;
  $('end-closing').textContent = GAME.closing || '';
  $('progress-fill').style.width = '100%';
}

$('start-btn').addEventListener('click', () => { showScreen('play'); renderQuestion(); });
$('next-btn').addEventListener('click', () => {
  if (!state.answered) return;
  if (state.index < GAME.questions.length - 1) {
    state.index += 1;
    renderQuestion();
  } else {
    showScreen('end');
    renderEnd();
  }
});
$('replay-btn').addEventListener('click', () => {
  state.index = 0; state.score = 0;
  showScreen('play'); renderQuestion();
});

// Phím tắt 1..4 chọn đáp án, Enter để sang câu sau (desktop).
document.addEventListener('keydown', (e) => {
  if ($('screen-play').classList.contains('hidden')) return;
  if (!state.answered && ['1', '2', '3', '4'].includes(e.key)) {
    answer(Number(e.key) - 1);
  } else if (state.answered && e.key === 'Enter') {
    $('next-btn').click();
  }
});

renderStart();
</script>
</body>
</html>`;
}
