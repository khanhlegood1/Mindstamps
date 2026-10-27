// src/lib/gameRenderers.js
//
// Render JSON game spec thành MỘT file HTML/CSS/JS tự chứa (không tài nguyên
// ngoài), chơi ngay trong <iframe srcDoc sandbox="allow-scripts">.
//
// Mỗi phong cách (xem gameStyles.js) có cơ chế chơi và màu nhấn riêng để mỗi
// phiên bản tạo ra mang "không khí" khác hẳn:
//   quiz       — trắc nghiệm 4 đáp án
//   truefalse  — phán đoán Đúng/Sai
//   matching   — ghép cặp khái niệm
//   flashcards — thẻ lật tự đánh giá
//   scenario   — tình huống ra quyết định
//
// An toàn: toàn bộ dữ liệu động được nhồi qua MỘT blob JSON (safeJson) và lúc
// chạy chỉ gán qua textContent/src — chữ của AI không thể inject markup.

import { getGameStyle } from './gameStyles.js';

const SOURCE_LABELS = {
  'groq-vision': 'Groq AI (hình ảnh + văn bản)',
  'groq-text': 'Groq AI (văn bản)',
  'gemini-fallback': 'Gemini AI (video + hình ảnh)',
  unknown: 'AI',
};

// Mô tả ngắn quy mô nội dung game, dùng cho nút "Bấm để chơi"
// (mỗi phong cách có đơn vị đếm khác nhau).
export function describeGameContent(spec) {
  if (!spec || typeof spec !== 'object') return 'Game giáo dục';
  const count = (arr) => (Array.isArray(arr) ? arr.length : 0);
  const maps = {
    quiz: () => `${count(spec.questions)} câu hỏi trắc nghiệm`,
    truefalse: () => `${count(spec.statements)} câu đúng / sai`,
    matching: () => `${count(spec.pairs)} cặp ghép`,
    flashcards: () => `${count(spec.cards)} thẻ ghi nhớ`,
    scenario: () => `${count(spec.scenarios)} tình huống`,
  };
  return (maps[spec.style] || maps.quiz)();
}

export function describeGameSource(source) {
  return SOURCE_LABELS[source] || 'AI';
}

export function safeJson(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// ---------------------------------------------------------------------------
// CSS chung (mọi style dùng cùng khung layout, đổi màu qua --accent*)
// ---------------------------------------------------------------------------

const BASE_CSS = `
  :root{
    --cream:#faf7f2; --beige:#f5f1ea; --brown:#8b7355; --deep:#5d4e37;
    --paper:#fefcf8; --ink:#2c2416; --good:#5f8a5b; --bad:#c2685a;
    --accent:#7a8a6b; --accent-dark:#5f6e52; --accent-soft:#eef2e8;
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
  .kicker{font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent-dark);font-weight:700;}
  h1{font-family:Georgia,'Crimson Text',serif;font-size:clamp(22px,5vw,32px);color:var(--deep);margin:8px 0 6px;line-height:1.2;}
  .tagline{color:var(--brown);font-size:14px;margin:0 0 14px;}
  .cover{width:100%;max-height:210px;object-fit:cover;border-radius:16px;margin-bottom:14px;box-shadow:0 8px 20px rgba(93,78,55,.18);}
  .cover-placeholder{
    width:100%;height:110px;border-radius:16px;margin-bottom:14px;
    display:flex;align-items:center;justify-content:center;font-size:44px;
    background:linear-gradient(135deg,#efe6d8,#e3d6c2);
  }
  .intro{white-space:pre-wrap;line-height:1.65;font-size:14.5px;color:var(--ink);background:var(--cream);
    border-left:4px solid var(--accent);padding:12px 14px;border-radius:0 12px 12px 0;margin:0 0 16px;}
  .memory-ref{font-size:12.5px;color:var(--brown);font-style:italic;margin:0 0 16px;}
  .btn{
    appearance:none;border:none;cursor:pointer;font-family:inherit;font-weight:600;
    border-radius:999px;padding:14px 26px;font-size:15px;transition:transform .15s,box-shadow .15s,opacity .15s;
    min-height:48px;width:100%;
  }
  .btn-primary{background:linear-gradient(135deg,var(--accent) 0%,var(--accent-dark) 100%);color:#fff;
    box-shadow:0 4px 12px rgba(0,0,0,.18);}
  .btn-primary:hover{transform:translateY(-2px);}
  .btn-warm{background:linear-gradient(135deg,var(--rose,#d4a574) 0%,var(--brown) 100%);color:#fff;}
  .btn:disabled{opacity:.45;cursor:not-allowed;transform:none;}
  .meta{margin-top:auto;padding-top:14px;font-size:11px;color:var(--brown);text-align:center;}
  .progress-wrap{padding:14px 4px 10px;flex-shrink:0;}
  .progress-top{display:flex;justify-content:space-between;font-size:12.5px;color:var(--brown);font-weight:600;margin-bottom:6px;gap:8px;}
  .progress-track{height:8px;border-radius:99px;background:#e7ddcd;overflow:hidden;}
  .progress-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent-dark));
    transition:width .35s ease;}
  .big-emoji{font-size:34px;text-align:center;margin:6px 0 10px;}
  .lead-text{font-family:Georgia,serif;font-size:clamp(17px,3.4vw,21px);color:var(--deep);line-height:1.45;margin:0 0 16px;font-weight:600;}
  .topic-badge{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
    padding:3px 10px;border-radius:99px;background:var(--accent-soft);color:var(--accent-dark);margin-bottom:10px;}
  .explain{
    margin-top:14px;padding:12px 14px;border-radius:12px;font-size:13.5px;line-height:1.6;
    background:#f3ede2;border:1px solid #e2d6c4;color:var(--deep);white-space:pre-wrap;
  }
  .explain strong{display:block;margin-bottom:4px;}
  .next-wrap{margin-top:14px;flex-shrink:0;}
  .score-ring{
    width:130px;height:130px;border-radius:50%;margin:8px auto 16px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:conic-gradient(var(--accent) calc(var(--pct)*1%),#e7ddcd 0);
  }
  .score-inner{width:104px;height:104px;border-radius:50%;background:var(--paper);
    display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .score-num{font-size:30px;font-weight:800;color:var(--deep);line-height:1;}
  .score-total{font-size:12px;color:var(--brown);margin-top:2px;}
  .verdict{font-family:Georgia,serif;font-size:19px;color:var(--deep);text-align:center;margin:0 0 10px;font-weight:600;}
  .closing{text-align:center;color:var(--brown);font-size:14px;line-height:1.6;margin:0 0 18px;white-space:pre-wrap;}
  .end-actions{display:flex;flex-direction:column;gap:10px;}
`;

// JS dùng chung cho mọi style: điều phối màn hình, render start/end, cover.
function commonJs() {
  return `
const TOPIC_LABELS = { video: 'Từ video', memory: 'Từ kỷ niệm', image: 'Từ hình ảnh' };
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
  $('start-meta').textContent = GAME.itemLabel + ' · Tạo bởi ' + GAME.sourceLabel + ' · ' + GAME.generatedAt;
}
function verdictFor(pct) {
  if (pct === 100) return '🏆 Xuất sắc! Bạn thuộc bài như in';
  if (pct >= 70) return '🌟 Rất giỏi! Bạn nắm rất chắc bài học';
  if (pct >= 40) return '🌱 Tốt lắm! Chơi lại để nhớ sâu hơn nhé';
  return '📚 Mỗi lần chơi là một lần học — thử lại nào!';
}
function renderEnd(score, total, extraLine) {
  const pct = total ? Math.round(score / total * 100) : 0;
  $('score-ring').style.setProperty('--pct', pct);
  $('end-score').textContent = score;
  $('end-total').textContent = '/ ' + total;
  $('end-verdict').textContent = extraLine || verdictFor(pct);
  $('end-closing').textContent = GAME.closing || '';
  $('progress-fill').style.width = '100%';
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
$('start-btn').addEventListener('click', () => startGame());
$('replay-btn').addEventListener('click', () => startGame());
renderStart();
`;
}

function shell({ spec, style, extraCss, bodyHtml, styleJs, runtime, coverImage, memoryTitle, source }) {
  const runtimeEnvelope = {
    gameTitle: spec.gameTitle,
    tagline: spec.tagline,
    intro: spec.intro,
    closing: spec.closing,
    style,
    coverImage: coverImage || null,
    memoryTitle: memoryTitle || '',
    sourceLabel: describeGameSource(source),
    generatedAt: new Date().toLocaleString('vi-VN'),
    ...runtime,
  };

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${String(spec.gameTitle || 'Mindstamps game').replace(/[<>&"]/g, '')}</title>
<style>
${BASE_CSS}
${extraCss}
</style>
</head>
<body>
<div id="app">
  <section class="screen" id="screen-start">
    <div class="card" style="margin:auto 0;width:100%;">
      <div class="kicker">🎮 Mindstamps · ${getGameStyle(style).emoji} ${getGameStyle(style).label}</div>
      <h1 id="start-title"></h1>
      <p class="tagline" id="start-tagline"></p>
      <div id="start-cover"></div>
      <p class="memory-ref" id="start-memory"></p>
      <p class="intro" id="start-intro"></p>
      <button class="btn btn-primary" id="start-btn">▶ Bắt đầu chơi</button>
      <div class="meta" id="start-meta"></div>
    </div>
  </section>
  <section class="screen hidden" id="screen-play">${bodyHtml}</section>
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
const GAME = ${safeJson(runtimeEnvelope)};
${commonJs()}
${styleJs}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 1) QUIZ — trắc nghiệm 4 đáp án
// ---------------------------------------------------------------------------

function renderQuiz(spec, opts) {
  const extraCss = `
  .choices{display:flex;flex-direction:column;gap:10px;}
  .choice{
    text-align:left;width:100%;padding:13px 16px;border-radius:14px;border:2px solid #e7ddcd;
    background:var(--paper);font-size:14.5px;font-family:inherit;color:var(--ink);cursor:pointer;
    transition:border-color .15s,background .15s;line-height:1.45;display:flex;gap:10px;align-items:flex-start;
  }
  .choice:hover:not(:disabled){border-color:var(--accent);}
  .choice .letter{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--beige);color:var(--deep);
    font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;}
  .choice.correct{border-color:var(--good);background:#eef5ec;}
  .choice.correct .letter{background:var(--good);color:#fff;}
  .choice.wrong{border-color:var(--bad);background:#fbeae7;}
  .choice.wrong .letter{background:var(--bad);color:#fff;}
  .choice:disabled{cursor:default;opacity:.92;}
  `;
  const bodyHtml = `
    <div class="progress-wrap">
      <div class="progress-top">
        <span id="progress-label">Câu 1</span>
        <span id="score-label">Điểm: 0</span>
      </div>
      <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
    </div>
    <div class="card" style="width:100%;">
      <span class="topic-badge" id="q-topic"></span>
      <div class="big-emoji" id="q-emoji">🎯</div>
      <p class="lead-text" id="q-text"></p>
      <div class="choices" id="q-choices"></div>
      <div class="explain hidden" id="q-explain"></div>
    </div>
    <div class="next-wrap"><button class="btn btn-warm hidden" id="next-btn">Tiếp theo →</button></div>
  `;
  const styleJs = `
const LETTERS = ['A', 'B', 'C', 'D'];
const state = { index: 0, score: 0, answered: false };
function startGame() {
  state.index = 0; state.score = 0;
  showScreen('play'); renderQuestion();
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
    btn.className = 'choice'; btn.type = 'button';
    const letter = document.createElement('span');
    letter.className = 'letter'; letter.textContent = LETTERS[i];
    const span = document.createElement('span');
    span.textContent = choice;
    btn.appendChild(letter); btn.appendChild(span);
    btn.addEventListener('click', () => answer(i));
    box.appendChild(btn);
  });
  const explain = $('q-explain');
  explain.classList.add('hidden'); explain.innerHTML = '';
  $('next-btn').classList.add('hidden');
  $('next-btn').textContent = state.index === GAME.questions.length - 1 ? 'Xem kết quả 🏁' : 'Tiếp theo →';
}
function answer(choiceIndex) {
  if (state.answered) return;
  state.answered = true;
  const q = GAME.questions[state.index];
  Array.from(document.querySelectorAll('.choice')).forEach((b, i) => {
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
$('next-btn').addEventListener('click', () => {
  if (!state.answered) return;
  if (state.index < GAME.questions.length - 1) { state.index += 1; renderQuestion(); }
  else { showScreen('end'); renderEnd(state.score, GAME.questions.length); }
});
document.addEventListener('keydown', (e) => {
  if ($('screen-play').classList.contains('hidden')) return;
  if (!state.answered && ['1','2','3','4'].includes(e.key)) answer(Number(e.key) - 1);
  else if (state.answered && e.key === 'Enter') $('next-btn').click();
});
`;
  return shell({
    spec,
    style: 'quiz',
    extraCss,
    bodyHtml,
    styleJs,
    runtime: { questions: spec.questions, itemLabel: spec.questions.length + ' câu hỏi' },
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// 2) TRUE/FALSE — Đúng hay Sai
// ---------------------------------------------------------------------------

function renderTrueFalse(spec, opts) {
  const extraCss = `
  .tf-buttons{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .tf-btn{
    border:2px solid #e7ddcd;background:var(--paper);border-radius:16px;padding:18px 10px;cursor:pointer;
    font-family:inherit;font-size:17px;font-weight:700;color:var(--deep);display:flex;flex-direction:column;
    align-items:center;gap:6px;transition:border-color .15s,background .15s,transform .1s;
  }
  .tf-btn .tf-icon{font-size:30px;}
  .tf-btn:hover:not(:disabled){border-color:var(--accent);}
  .tf-btn.correct{border-color:var(--good);background:#eef5ec;}
  .tf-btn.wrong{border-color:var(--bad);background:#fbeae7;}
  .tf-btn:disabled{cursor:default;opacity:.92;}
  `;
  const bodyHtml = `
    <div class="progress-wrap">
      <div class="progress-top">
        <span id="progress-label">Nhận định 1</span>
        <span id="score-label">Điểm: 0</span>
      </div>
      <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
    </div>
    <div class="card" style="width:100%;">
      <span class="topic-badge" id="tf-topic"></span>
      <div class="big-emoji" id="tf-emoji">⚖️</div>
      <p class="lead-text" id="tf-text"></p>
      <div class="tf-buttons" id="tf-buttons">
        <button class="tf-btn" type="button" data-v="true"><span class="tf-icon">✅</span><span>Đúng</span></button>
        <button class="tf-btn" type="button" data-v="false"><span class="tf-icon">❌</span><span>Sai</span></button>
      </div>
      <div class="explain hidden" id="tf-explain"></div>
    </div>
    <div class="next-wrap"><button class="btn btn-warm hidden" id="next-btn">Tiếp theo →</button></div>
  `;
  const styleJs = `
const state = { index: 0, score: 0, answered: false };
function startGame() {
  state.index = 0; state.score = 0;
  showScreen('play'); renderItem();
}
function renderItem() {
  const item = GAME.statements[state.index];
  state.answered = false;
  $('progress-label').textContent = 'Nhận định ' + (state.index + 1) + ' / ' + GAME.statements.length;
  $('score-label').textContent = 'Điểm: ' + state.score;
  $('progress-fill').style.width = (state.index / GAME.statements.length * 100) + '%';
  $('tf-topic').textContent = TOPIC_LABELS[item.topic] || 'Nhận định';
  $('tf-emoji').textContent = item.emoji || '⚖️';
  $('tf-text').textContent = item.statement;
  Array.from(document.querySelectorAll('.tf-btn')).forEach((b) => {
    b.disabled = false; b.classList.remove('correct', 'wrong');
  });
  const explain = $('tf-explain');
  explain.classList.add('hidden'); explain.innerHTML = '';
  $('next-btn').classList.add('hidden');
  $('next-btn').textContent = state.index === GAME.statements.length - 1 ? 'Xem kết quả 🏁' : 'Tiếp theo →';
}
function answer(userSaysTrue, clickedBtn) {
  if (state.answered) return;
  state.answered = true;
  const item = GAME.statements[state.index];
  const picked = userSaysTrue ? 'true' : 'false';
  const truth = item.isTrue ? 'true' : 'false';
  Array.from(document.querySelectorAll('.tf-btn')).forEach((b) => {
    b.disabled = true;
    if (b.getAttribute('data-v') === truth) b.classList.add('correct');
    if (b === clickedBtn && picked !== truth) b.classList.add('wrong');
  });
  const correct = picked === truth;
  if (correct) state.score += 1;
  $('score-label').textContent = 'Điểm: ' + state.score;
  const explain = $('tf-explain');
  const strong = document.createElement('strong');
  strong.textContent = correct ? '✅ Chính xác! Nhận định này ' + (item.isTrue ? 'ĐÚNG' : 'SAI')
    : '💡 Chưa đúng — nhận định này thực ra ' + (item.isTrue ? 'ĐÚNG' : 'SAI');
  explain.appendChild(strong);
  explain.appendChild(document.createTextNode(item.explanation || ''));
  explain.classList.remove('hidden');
  $('next-btn').classList.remove('hidden');
}
Array.from(document.querySelectorAll('.tf-btn')).forEach((b) => {
  b.addEventListener('click', () => answer(b.getAttribute('data-v') === 'true', b));
});
$('next-btn').addEventListener('click', () => {
  if (!state.answered) return;
  if (state.index < GAME.statements.length - 1) { state.index += 1; renderItem(); }
  else { showScreen('end'); renderEnd(state.score, GAME.statements.length); }
});
`;
  return shell({
    spec,
    style: 'truefalse',
    extraCss,
    bodyHtml,
    styleJs,
    runtime: { statements: spec.statements, itemLabel: spec.statements.length + ' nhận định' },
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// 3) MATCHING — ghép cặp khái niệm
// ---------------------------------------------------------------------------

function renderMatching(spec, opts) {
  const extraCss = `
  .match-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .match-col-title{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
    color:var(--brown);text-align:center;margin-bottom:6px;}
  .chip{
    width:100%;text-align:left;padding:11px 12px;border-radius:12px;border:2px solid #e7ddcd;
    background:var(--paper);font-size:13.5px;font-family:inherit;color:var(--ink);cursor:pointer;line-height:1.4;
    transition:border-color .15s,background .15s,transform .1s;min-height:52px;
  }
  .chip:hover:not(:disabled){border-color:var(--accent);}
  .chip.selected{border-color:var(--accent);background:var(--accent-soft);font-weight:600;}
  .chip.matched{border-color:var(--good);background:#eef5ec;cursor:default;opacity:.85;}
  .chip.miss{animation:missflash .35s ease 2;}
  @keyframes missflash{50%{border-color:var(--bad);background:#fbeae7;}}
  .match-status{margin-top:12px;font-size:13px;color:var(--brown);text-align:center;min-height:20px;}
  `;
  const bodyHtml = `
    <div class="progress-wrap">
      <div class="progress-top">
        <span id="progress-label">Đã ghép 0</span>
        <span id="mistake-label">Sai: 0</span>
      </div>
      <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
    </div>
    <div class="card" style="width:100%;">
      <p class="lead-text" style="font-size:16px;">Bấm một thẻ bên trái rồi bấm thẻ tương ứng bên phải để ghép cặp.</p>
      <div class="match-grid">
        <div>
          <div class="match-col-title">Khái niệm</div>
          <div id="left-col" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>
        <div>
          <div class="match-col-title">Ý nghĩa</div>
          <div id="right-col" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>
      </div>
      <div class="match-status" id="match-status">Hãy chọn cặp đầu tiên 👇</div>
    </div>
  `;
  const styleJs = `
let leftItems = [], rightItems = [], selectedLeft = null, matched = 0, mistakes = 0;
function startGame() {
  leftItems = shuffle(GAME.pairs.map((p, i) => ({ id: i, text: p.left })));
  rightItems = shuffle(GAME.pairs.map((p, i) => ({ id: i, text: p.right })));
  selectedLeft = null; matched = 0; mistakes = 0;
  buildColumns();
  $('mistake-label').textContent = 'Sai: 0';
  $('match-status').textContent = 'Hãy chọn cặp đầu tiên 👇';
  $('progress-label').textContent = 'Đã ghép 0 / ' + GAME.pairs.length;
  $('progress-fill').style.width = '0%';
  showScreen('play');
}
function buildColumns() {
  const lc = $('left-col'), rc = $('right-col');
  lc.innerHTML = ''; rc.innerHTML = '';
  leftItems.forEach((item) => lc.appendChild(makeChip(item, 'left')));
  rightItems.forEach((item) => rc.appendChild(makeChip(item, 'right')));
}
function makeChip(item, side) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip';
  btn.textContent = item.text;
  btn.dataset.id = item.id;
  btn.dataset.side = side;
  btn.addEventListener('click', () => onChip(btn, item, side));
  return btn;
}
function onChip(btn, item, side) {
  if (btn.classList.contains('matched')) return;
  if (side === 'left') {
    document.querySelectorAll('#left-col .chip').forEach((c) => c.classList.remove('selected'));
    btn.classList.add('selected');
    selectedLeft = { btn, item };
    $('match-status').textContent = 'Đã chọn "' + item.text + '" — giờ hãy tìm ý nghĩa tương ứng.';
    return;
  }
  if (!selectedLeft) {
    $('match-status').textContent = 'Hãy chọn một thẻ khái niệm ở cột trái trước đã nhé.';
    return;
  }
  if (selectedLeft.item.id === item.id) {
    btn.classList.add('matched');
    selectedLeft.btn.classList.remove('selected');
    selectedLeft.btn.classList.add('matched');
    selectedLeft.btn.disabled = true;
    btn.disabled = true;
    matched += 1;
    selectedLeft = null;
    $('progress-label').textContent = 'Đã ghép ' + matched + ' / ' + GAME.pairs.length;
    $('progress-fill').style.width = (matched / GAME.pairs.length * 100) + '%';
    $('match-status').textContent = 'Ghép đúng rồi! 🎉';
    if (matched === GAME.pairs.length) finishGame();
  } else {
    mistakes += 1;
    $('mistake-label').textContent = 'Sai: ' + mistakes;
    btn.classList.add('miss');
    selectedLeft.btn.classList.add('miss');
    const badBtn = btn, badLeft = selectedLeft.btn;
    setTimeout(() => { badBtn.classList.remove('miss'); badLeft.classList.remove('miss'); }, 750);
    $('match-status').textContent = 'Chưa khớp — thử lại cặp khác nhé.';
  }
}
function finishGame() {
  const total = GAME.pairs.length;
  const accuracyPct = Math.round(total / (total + mistakes) * 100);
  showScreen('end');
  renderEnd(accuracyPct, 100,
    mistakes === 0 ? '🏆 Ghép hoàn hảo, không sai lần nào!'
    : '🌟 Hoàn thành với ' + mistakes + ' lần ghép sai — chơi lại để đạt tuyệt đối nhé!');
}
`;
  return shell({
    spec,
    style: 'matching',
    extraCss,
    bodyHtml,
    styleJs,
    runtime: { pairs: spec.pairs, itemLabel: spec.pairs.length + ' cặp khái niệm' },
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// 4) FLASHCARDS — thẻ ghi nhớ lật mặt
// ---------------------------------------------------------------------------

function renderFlashcards(spec, opts) {
  const extraCss = `
  .flash-stage{perspective:1200px;margin-bottom:16px;}
  .flash-card{
    position:relative;width:100%;min-height:260px;cursor:pointer;
    transform-style:preserve-3d;transition:transform .55s cubic-bezier(.4,.2,.2,1);
  }
  .flash-card.flipped{transform:rotateY(180deg);}
  .flash-face{
    position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;
    border-radius:18px;border:2px solid #e7ddcd;background:var(--paper);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
    padding:24px;text-align:center;box-shadow:0 8px 20px rgba(139,115,85,.14);
  }
  .flash-face.back{transform:rotateY(180deg);background:var(--accent-soft);border-color:var(--accent);}
  .flash-emoji{font-size:40px;}
  .flash-text{font-family:Georgia,serif;font-size:clamp(17px,3.2vw,21px);color:var(--deep);line-height:1.5;font-weight:600;}
  .flash-hint{font-size:11.5px;color:var(--brown);letter-spacing:1px;text-transform:uppercase;}
  .flash-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .btn-review{background:var(--paper);color:var(--deep);border:2px solid #e7ddcd;}
  .btn-known{background:linear-gradient(135deg,var(--accent),var(--accent-dark));color:#fff;border:none;}
  `;
  const bodyHtml = `
    <div class="progress-wrap">
      <div class="progress-top">
        <span id="progress-label">Thẻ 1</span>
        <span id="score-label">😎 Đã nhớ: 0</span>
      </div>
      <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
    </div>
    <div class="card" style="width:100%;">
      <div class="flash-stage">
        <div class="flash-card" id="flash-card">
          <div class="flash-face front">
            <div class="flash-emoji" id="flash-emoji">🃏</div>
            <div class="flash-text" id="flash-front"></div>
            <div class="flash-hint">Bấm vào thẻ để xem đáp án</div>
          </div>
          <div class="flash-face back">
            <div class="flash-text" id="flash-back"></div>
            <div class="flash-hint">Đây là mặt đáp án</div>
          </div>
        </div>
      </div>
      <div class="flash-actions">
        <button class="btn btn-review" id="btn-review">🤔 Cần ôn lại</button>
        <button class="btn btn-known" id="btn-known">😎 Đã nhớ</button>
      </div>
    </div>
  `;
  const styleJs = `
const state = { index: 0, remembered: 0 };
function startGame() {
  state.index = 0; state.remembered = 0;
  showScreen('play'); renderCard();
}
function renderCard() {
  const card = GAME.cards[state.index];
  const el = $('flash-card');
  el.classList.remove('flipped');
  $('flash-emoji').textContent = card.emoji || '🃏';
  $('flash-front').textContent = card.front;
  $('flash-back').textContent = card.back;
  $('progress-label').textContent = 'Thẻ ' + (state.index + 1) + ' / ' + GAME.cards.length;
  $('score-label').textContent = '😎 Đã nhớ: ' + state.remembered;
  $('progress-fill').style.width = (state.index / GAME.cards.length * 100) + '%';
}
$('flash-card').addEventListener('click', () => $('flash-card').classList.toggle('flipped'));
function advance(known) {
  if (known) state.remembered += 1;
  if (state.index < GAME.cards.length - 1) { state.index += 1; renderCard(); }
  else finishGame();
}
$('btn-known').addEventListener('click', () => advance(true));
$('btn-review').addEventListener('click', () => advance(false));
function finishGame() {
  const total = GAME.cards.length;
  const review = total - state.remembered;
  showScreen('end');
  renderEnd(state.remembered, total,
    review === 0 ? '🏆 Bạn đã nhớ toàn bộ ' + total + ' thẻ!'
    : '🌱 ' + state.remembered + ' thẻ đã nhớ, ' + review + ' thẻ cần ôn lại — lật lại vài lượt nữa nhé!');
}
`;
  return shell({
    spec,
    style: 'flashcards',
    extraCss,
    bodyHtml,
    styleJs,
    runtime: { cards: spec.cards, itemLabel: spec.cards.length + ' thẻ ghi nhớ' },
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// 5) SCENARIO — tình huống ra quyết định
// ---------------------------------------------------------------------------

function renderScenario(spec, opts) {
  const extraCss = `
  .choices{display:flex;flex-direction:column;gap:10px;}
  .choice{
    text-align:left;width:100%;padding:13px 16px;border-radius:14px;border:2px solid #e7ddcd;
    background:var(--paper);font-size:14.5px;font-family:inherit;color:var(--ink);cursor:pointer;
    line-height:1.45;display:flex;gap:10px;align-items:flex-start;
  }
  .choice:hover:not(:disabled){border-color:var(--accent);}
  .choice .letter{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--beige);color:var(--deep);
    font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;}
  .choice.best{border-color:var(--good);background:#eef5ec;}
  .choice.best .letter{background:var(--good);color:#fff;}
  .choice.wrong{border-color:var(--bad);background:#fbeae7;}
  .choice.wrong .letter{background:var(--bad);color:#fff;}
  .choice:disabled{cursor:default;opacity:.92;}
  `;
  const bodyHtml = `
    <div class="progress-wrap">
      <div class="progress-top">
        <span id="progress-label">Tình huống 1</span>
        <span id="score-label">Điểm sáng suốt: 0</span>
      </div>
      <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
    </div>
    <div class="card" style="width:100%;">
      <span class="topic-badge" id="sc-topic"></span>
      <div class="big-emoji" id="sc-emoji">🧭</div>
      <p class="lead-text" id="sc-text"></p>
      <div class="choices" id="sc-choices"></div>
      <div class="explain hidden" id="sc-explain"></div>
    </div>
    <div class="next-wrap"><button class="btn btn-warm hidden" id="next-btn">Tiếp theo →</button></div>
  `;
  const styleJs = `
const LETTERS = ['A', 'B', 'C'];
const state = { index: 0, score: 0, answered: false };
function startGame() {
  state.index = 0; state.score = 0;
  showScreen('play'); renderItem();
}
function renderItem() {
  const item = GAME.scenarios[state.index];
  state.answered = false;
  $('progress-label').textContent = 'Tình huống ' + (state.index + 1) + ' / ' + GAME.scenarios.length;
  $('score-label').textContent = 'Điểm sáng suốt: ' + state.score;
  $('progress-fill').style.width = (state.index / GAME.scenarios.length * 100) + '%';
  $('sc-topic').textContent = TOPIC_LABELS[item.topic] || 'Tình huống';
  $('sc-emoji').textContent = item.emoji || '🧭';
  $('sc-text').textContent = item.situation;
  const box = $('sc-choices');
  box.innerHTML = '';
  item.choices.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice'; btn.type = 'button';
    const letter = document.createElement('span');
    letter.className = 'letter'; letter.textContent = LETTERS[i];
    const span = document.createElement('span');
    span.textContent = choice;
    btn.appendChild(letter); btn.appendChild(span);
    btn.addEventListener('click', () => answer(i));
    box.appendChild(btn);
  });
  const explain = $('sc-explain');
  explain.classList.add('hidden'); explain.innerHTML = '';
  $('next-btn').classList.add('hidden');
  $('next-btn').textContent = state.index === GAME.scenarios.length - 1 ? 'Xem kết quả 🏁' : 'Tiếp theo →';
}
function answer(choiceIndex) {
  if (state.answered) return;
  state.answered = true;
  const item = GAME.scenarios[state.index];
  Array.from(document.querySelectorAll('.choice')).forEach((b, i) => {
    b.disabled = true;
    if (i === item.bestIndex) b.classList.add('best');
    if (i === choiceIndex && i !== item.bestIndex) b.classList.add('wrong');
  });
  const best = choiceIndex === item.bestIndex;
  if (best) state.score += 1;
  $('score-label').textContent = 'Điểm sáng suốt: ' + state.score;
  const explain = $('sc-explain');
  const strong = document.createElement('strong');
  strong.textContent = best ? '🎯 Lựa chọn sáng suốt!' : '💡 Hợp lý nhất là phương án ' + LETTERS[item.bestIndex];
  explain.appendChild(strong);
  explain.appendChild(document.createTextNode(item.explanation || ''));
  explain.classList.remove('hidden');
  $('next-btn').classList.remove('hidden');
}
$('next-btn').addEventListener('click', () => {
  if (!state.answered) return;
  if (state.index < GAME.scenarios.length - 1) { state.index += 1; renderItem(); }
  else { showScreen('end'); renderEnd(state.score, GAME.scenarios.length); }
});
`;
  return shell({
    spec,
    style: 'scenario',
    extraCss,
    bodyHtml,
    styleJs,
    runtime: { scenarios: spec.scenarios, itemLabel: spec.scenarios.length + ' tình huống' },
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const RENDERERS = {
  quiz: renderQuiz,
  truefalse: renderTrueFalse,
  matching: renderMatching,
  flashcards: renderFlashcards,
  scenario: renderScenario,
};

export function renderLearningGameHtml(spec, opts = {}) {
  const style = spec?.style && RENDERERS[spec.style] ? spec.style : 'quiz';
  return RENDERERS[style](spec, opts);
}
