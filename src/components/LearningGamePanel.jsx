import { useState } from 'react';
import { generateLearningGame, describeGameSource, LearningGameError } from '../lib/learningGame';
import LearningGamePlayer from './LearningGamePlayer';

// LearningGamePanel — nút "Tạo game giáo dục" dùng chung cho mọi form memory
// (CreateMemory, Journal MemorySpread edit, MemoryDetailPanel edit).
//
// AI đọc tổ hợp tư liệu đang có của form — link video (phụ đề), tiêu đề,
// câu chuyện (body description) và ảnh — để sinh JSON game spec; client render
// thành HTML game tự chứa và cho chơi NGAY trong iframe (xem LearningGamePlayer).
// Component là controlled: spec/source do form giữ để lưu kèm memory
// (field Firestore `learningGame`).
export default function LearningGamePanel({
  videoUrl = '',
  title = '',
  story = '',
  imageData = null,
  spec = null,
  onSpecChange,
  source = '',
  onSourceChange,
  memoryTitle = '',
  height = 420,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasAnyMaterial =
    Boolean(videoUrl?.trim()) || Boolean(title?.trim()) || Boolean(story?.trim()) || Boolean(imageData);

  const handleGenerate = async () => {
    if (!hasAnyMaterial || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await generateLearningGame({
        title,
        story,
        videoUrl: videoUrl?.trim() || '',
        imageData,
      });
      onSpecChange?.(result.spec);
      onSourceChange?.(result.source);
    } catch (err) {
      const message =
        err instanceof LearningGameError
          ? err.message
          : err?.message || 'Không tạo được game. Vui lòng thử lại.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-3 sm:p-4"
      style={{ background: 'var(--warm-cream)', border: '1px solid var(--soft-beige)' }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--deep-brown)' }}>
            🎮 Game giáo dục
          </div>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--warm-brown)' }}>
            AI diễn giải video cùng tiêu đề, câu chuyện và hình ảnh thành game trắc nghiệm chơi được ngay.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!hasAnyMaterial || loading}
          className="btn-sage whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <span
                className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"
                aria-hidden="true"
              />
              Đang tạo game...
            </>
          ) : spec ? (
            '🔄 Tạo lại game'
          ) : (
            '🎮 Tạo game giáo dục'
          )}
        </button>
      </div>

      {!hasAnyMaterial && (
        <p className="text-xs mt-2 italic" style={{ color: 'var(--warm-brown)' }}>
          Hãy nhập link video, tiêu đề, câu chuyện hoặc thêm ảnh để có tư liệu tạo game.
        </p>
      )}

      {loading && (
        <div className="mt-3 p-3 rounded-xl text-sm flex items-center gap-3" style={{ background: 'var(--paper-white)', color: 'var(--warm-brown)' }}>
          <span
            className="inline-block w-5 h-5 border-3 border-t-transparent rounded-full animate-spin flex-shrink-0"
            style={{ borderColor: 'var(--dusty-rose)', borderTopColor: 'transparent' }}
            aria-hidden="true"
          />
          <span>
            Đang trích nội dung video và dựng câu hỏi giáo dục... bước này có thể mất 30–90 giây với video dài.
          </span>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: '#fdeaea', color: '#a33' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <span className="leading-relaxed">{error}</span>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!hasAnyMaterial || loading}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-all duration-200 hover:shadow-md disabled:opacity-50"
              style={{ background: 'var(--warm-brown)' }}
            >
              🔁 Thử lại
            </button>
          </div>
        </div>
      )}

      {spec && !loading && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: 'var(--soft-beige)', color: 'var(--deep-brown)' }}
            >
              ✅ Đã tạo {spec.questions?.length || 0} câu hỏi · nguồn: {describeGameSource(source)}
            </span>
            <span className="text-xs" style={{ color: 'var(--warm-brown)' }}>
              Game sẽ được lưu kèm kỷ niệm này.
            </span>
          </div>
          <LearningGamePlayer
            spec={spec}
            coverImage={imageData}
            memoryTitle={memoryTitle || title}
            source={source}
            height={height}
          />
        </div>
      )}
    </div>
  );
}
