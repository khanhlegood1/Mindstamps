import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/learning-game.js';
import { GAME_STYLES } from '../src/lib/gameStyles.js';
import { createGameVersion, normalizeGameVersions } from '../src/lib/learningGame.js';
import { renderLearningGameHtml, describeGameContent } from '../src/lib/gameRenderers.js';

const spec = { style: 'action', gameTitle: 'Vũ trụ', intro: 'Khám phá', closing: 'Tuyệt!', playerEmoji: '🚀', objects: [
  { emoji: '🌍', label: 'Trái đất', lesson: 'Hành tinh xanh', collect: true },
  { emoji: '🌕', label: 'Mặt trăng', lesson: 'Vệ tinh', collect: true },
  { emoji: '⭐', label: 'Sao', lesson: 'Phát sáng', collect: true },
  { emoji: '☄️', label: 'Thiên thạch', lesson: 'Cần tránh', collect: false },
] };

function runtime(game = spec) {
  const html = renderLearningGameHtml(game);
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const nodes = new Map();
  const element = () => ({ style: {}, children: [], textContent: '', disabled: false, listeners: {},
    append(el) { this.children.push(el); }, prepend(el) { this.children.unshift(el); }, remove() {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setPointerCapture() {}, hasPointerCapture() { return true; },
    getBoundingClientRect() { return { left: 0, width: 100 }; },
    click() { this.onclick?.(); },
  });
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }, createElement: element, addEventListener() {} };
  const window = { addEventListener() {} };
  let frame;
  const ctx = vm.createContext({ document, window, requestAnimationFrame(fn) { frame = fn; }, Math });
  vm.runInContext(code, ctx);
  return { nodes, run: (s) => vm.runInContext(s, ctx), tick: (t) => frame(t), html };
}

test('action and custom persist as versions without changing the catalog', () => {
  const before = GAME_STYLES.length;
  for (const style of ['action', 'custom']) {
    const v = createGameVersion({ ...spec, style, customDescription: 'Phi hành gia cứu hành tinh' });
    const saved = JSON.parse(JSON.stringify({ learningGameVersions: [v] }));
    assert.equal(normalizeGameVersions(saved)[0].spec.customDescription, 'Phi hành gia cứu hành tinh');
    assert.match(describeGameContent(v.spec), /vật thể/);
  }
  assert.equal(GAME_STYLES.length, before);
});

test('standalone HTML escapes injected markup and JavaScript compiles', () => {
  const { html, nodes } = runtime({ ...spec, customDescription: '</script><img src=x onerror=alert(1)>' });
  assert.equal((html.match(/<script>/g) || []).length, 1);
  assert.ok(!html.includes('<img src=x'));
  assert.match(nodes.get('description').textContent, /<\/script>/);
  assert.equal(nodes.get('legend').children.length, 4);
});

test('game supports movement, collection victory, pause, hazards, and replay', () => {
  const r = runtime();
  r.nodes.get('start').click();
  r.run('right=true'); r.tick(1000); r.tick(1050);
  assert.ok(r.run('x') > 50);
  r.nodes.get('pause').click();
  const x = r.run('x'); r.tick(1100); assert.equal(r.run('x'), x);
  r.nodes.get('pause').click();
  r.run("right=false; score=9; entities=[{o:objects[0],el:document.createElement('span'),x:x,y:87}]");
  r.tick(1150);
  assert.equal(r.run('score'), 10);
  assert.equal(r.run('running'), false);
  assert.match(r.nodes.get('lesson').textContent, /Hoàn thành/);
  r.nodes.get('start').click();
  assert.equal(r.run('score'), 0);
  r.run("lives=1; entities=[{o:objects[3],el:document.createElement('span'),x:x,y:87}]");
  r.tick(1200); r.tick(1250);
  assert.equal(r.run('lives'), 0);
  assert.equal(r.run('running'), false);
});

test('API respects explicit selection, stores exact custom description, and rejects invalid inputs', async () => {
  const { default: process } = await import('node:process');
  const oldKey = process.env.GROQ_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GROQ_API_KEY = 'test-only';
  let prompt;
  globalThis.fetch = async (_url, options) => {
    prompt = JSON.parse(options.body).messages;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(spec) } }] }) };
  };
  const request = async (body) => {
    let status, result;
    const res = { setHeader() {}, status(code) { status = code; return this; }, json(data) { result = data; return this; } };
    await handler({ method: 'POST', body: { title: 'Vũ trụ', ...body } }, res);
    return { status, result };
  };
  try {
    const action = await request({ requestedStyle: 'action', excludeStyles: ['action'] });
    assert.equal(action.status, 200);
    assert.equal(action.result.spec.style, 'action');
    const custom = await request({ requestedStyle: 'custom', customDescription: '  Phi hành gia cứu hành tinh  ' });
    assert.equal(custom.status, 200);
    assert.equal(custom.result.spec.style, 'custom');
    assert.equal(custom.result.spec.customDescription, 'Phi hành gia cứu hành tinh');
    assert.ok(JSON.stringify(prompt).includes('Phi hành gia cứu hành tinh'));
    assert.equal((await request({ requestedStyle: 'custom', customDescription: ' ' })).status, 400);
    assert.equal((await request({ requestedStyle: 'bad' })).status, 400);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldKey;
  }
});

test('existing quiz versions still normalize and render', () => {
  const quiz = { style: 'quiz', gameTitle: 'Cũ', questions: [{ question: 'Q?', choices: ['A', 'B', 'C', 'D'], answerIndex: 0, explanation: 'A' }] };
  const legacy = normalizeGameVersions({ learningGame: quiz });
  assert.equal(legacy.length, 1);
  const html = renderLearningGameHtml(legacy[0].spec);
  assert.ok(html.includes('Q?'));
  assert.ok(html.includes('screen-play'));
});
