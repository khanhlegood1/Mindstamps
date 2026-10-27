import { useMemo, useState } from 'react';
import { renderLearningGameHtml, describeGameContent } from '../lib/learningGame';

// LearningGamePlayer — nhúng game HTML tự chứa trong iframe.
//
// Bám đúng bài học của BringAnyIdeaToLifePanel.jsx (ai-doctor-admin3):
// KHÔNG mount iframe nặng ngay khi component xuất hiện (iframe chạy HTML/CSS/JS
// game có thể chặn main thread trên máy yếu, làm đơ cả trang như loạt bug
// "Trang không phản hồi" đã gặp). Thay vào đó render một "gate" nhẹ, chỉ tạo
// iframe THẬT sau khi người dùng bấm "Bấm để chơi".
//
// Chế độ mặc định là một khung chơi gọn ngay trong trang; có thể phóng to
// toàn màn hình bằng nút mở rộng. Iframe dùng sandbox="allow-scripts" (game
// tự chứa hoàn toàn, không cần same-origin, không tài nguyên ngoài).
export default function LearningGamePlayer({
  spec,
  coverImage = null,
  memoryTitle = '',
  source = '',
  height = 460,
  defaultOpen = false,
}) {
  const [started, setStarted] = useState(defaultOpen);
  const [fullscreen, setFullscreen] = useState(false);

  const html = useMemo(() => {
    if (!spec) return '';
    return renderLearningGameHtml(spec, { coverImage, memoryTitle, source });
  }, [spec, coverImage, memoryTitle, source]);

  if (!spec) return null;

  const downloadHtml = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (spec.gameTitle || 'mindstamps-learning-game')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'mindstamps-learning-game';
    a.href = url;
    a.download = `${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const gate = (
    <button
      type="button"
      onClick={() => setStarted(true)}
      className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center cursor-pointer border-2 border-dashed transition-all duration-300 hover:scale-[1.01]"
      style={{
        minHeight: Math.min(height, 220),
        borderColor: 'var(--sage-green)',
        background: 'linear-gradient(135deg, #f3f6ee 0%, var(--warm-cream) 100%)',
        color: 'var(--deep-brown)',
      }}
    >
      <span style={{ fontSize: 38 }}>🎮</span>
      <span className="font-journal font-semibold text-lg">Bấm để chơi game giáo dục</span>
      <span className="text-sm" style={{ color: 'var(--warm-brown)' }}>
        {describeGameContent(spec)} · chơi ngay trong trang, không cần cài đặt gì
      </span>
    </button>
  );

  const frame = (
    <iframe
      title={spec.gameTitle || 'Learning game'}
      srcDoc={html}
      sandbox="allow-scripts"
      className="w-full rounded-2xl border-0 bg-white"
      style={{ height: fullscreen ? '100%' : height }}
      allow="fullscreen"
    />
  );

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 p-3 sm:p-6' : ''} style={fullscreen ? { background: 'rgba(44, 36, 22, 0.55)' } : undefined}>
      <div
        className={fullscreen ? 'w-full h-full max-w-3xl mx-auto flex flex-col rounded-2xl overflow-hidden' : ''}
        style={fullscreen ? { background: 'var(--paper-white)' } : undefined}
      >
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap"
          style={{ background: 'var(--warm-cream)', borderBottom: '1px solid var(--soft-beige)' }}
        >
          <div className="text-sm font-medium truncate" style={{ color: 'var(--deep-brown)' }}>
            🎮 {spec.gameTitle || 'Game giáo dục'}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={downloadHtml}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:shadow-md"
              style={{ background: 'var(--paper-white)', color: 'var(--warm-brown)', border: '1px solid var(--soft-beige)' }}
              title="Tải file HTML tự chứa để chơi offline / chia sẻ"
            >
              ⬇️ Tải HTML
            </button>
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-white transition-all duration-200 hover:shadow-md"
              style={{ background: 'var(--sage-green)' }}
            >
              {fullscreen ? '↩️ Thu nhỏ' : '⛶ Toàn màn hình'}
            </button>
            {fullscreen && (
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-white"
                style={{ background: 'var(--warm-brown)' }}
              >
                ✕ Đóng
              </button>
            )}
          </div>
        </div>
        {started ? frame : gate}
      </div>
    </div>
  );
}
