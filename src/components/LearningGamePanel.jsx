import { useState } from 'react';
import {
  generateLearningGame,
  createGameVersion,
  LearningGameError,
  MAX_GAME_VERSIONS,
} from '../lib/learningGame';
import LearningGameVersionRow from './LearningGameVersionRow';

// LearningGamePanel — trình quản lý "Game giáo dục" dùng trong các form sửa/tạo
// memory (CreateMemory, Journal MemorySpread edit, MemoryDetailPanel edit).
//
// Mỗi lần bấm tạo sẽ sinh MỘT PHIÊN BẢN MỚI với phong cách chơi khác (server tự
// xoay vòng qua trắc nghiệm, đúng/sai, ghép cặp, flashcard, tình huống). Các
// phiên bản lưu trong mảng `versions` do form giữ để ghi lên Firestore field
// `learningGameVersions`; từng phiên bản chơi được ngay và xoá được (có xác
// nhận Yes/No ở LearningGameVersionRow).
export default function LearningGamePanel({
  videoUrl = '',
  title = '',
  story = '',
  imageData = null,
  memoryTitle = '',
  versions = [],
  onVersionsChange,
  height = 380,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openVersionId, setOpenVersionId] = useState(null);

  const hasAnyMaterial =
    Boolean(videoUrl?.trim()) || Boolean(title?.trim()) || Boolean(story?.trim()) || Boolean(imageData);
  const reachedCap = versions.length >= MAX_GAME_VERSIONS;

  const handleGenerate = async () => {
    if (!hasAnyMaterial || loading || reachedCap) return;
    setLoading(true);
    setError('');
    try {
      // Gửi danh sách style đã dùng để server chọn style KHÁC cho phiên bản mới.
      const { spec, source } = await generateLearningGame({
        title,
        story,
        videoUrl: videoUrl?.trim() || '',
        imageData,
        excludeStyles: versions.map((v) => v.style),
      });
      const newVersion = createGameVersion(spec, source);
      const next = [...versions, newVersion];
      onVersionsChange?.(next);
      setOpenVersionId(newVersion.id); // tự mở phiên bản vừa tạo để chơi ngay
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

  const handleDelete = (versionId) => {
    const next = versions.filter((v) => v.id !== versionId);
    onVersionsChange?.(next);
    if (openVersionId === versionId) setOpenVersionId(null);
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
            {versions.length > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--soft-beige)', color: 'var(--warm-brown)' }}
              >
                {versions.length}/{MAX_GAME_VERSIONS} phiên bản
              </span>
            )}
          </div>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--warm-brown)' }}>
            Mỗi lần tạo là một phiên bản mới với phong cách game khác nhau, dựa trên video, tiêu đề, câu chuyện và hình ảnh.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!hasAnyMaterial || loading || reachedCap}
          className="btn-sage whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <span
                className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"
                aria-hidden="true"
              />
              Đang tạo phiên bản...
            </>
          ) : versions.length > 0 ? (
            '✨ Tạo phiên bản mới'
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

      {reachedCap && (
        <p className="text-xs mt-2" style={{ color: 'var(--warm-brown)' }}>
          Đã đạt giới hạn {MAX_GAME_VERSIONS} phiên bản cho mỗi kỷ niệm. Hãy xoá bớt một phiên bản nếu muốn tạo cái mới.
        </p>
      )}

      {loading && (
        <div
          className="mt-3 p-3 rounded-xl text-sm flex items-center gap-3"
          style={{ background: 'var(--paper-white)', color: 'var(--warm-brown)' }}
        >
          <span
            className="inline-block w-5 h-5 border-3 border-t-transparent rounded-full animate-spin flex-shrink-0"
            style={{ borderColor: 'var(--dusty-rose)', borderTopColor: 'transparent' }}
            aria-hidden="true"
          />
          <span>
            Đang trích nội dung video và dựng một game mới theo phong cách khác... bước này có thể mất 30–90 giây.
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

      {versions.length > 0 && (
        <div className="mt-3 space-y-2">
          {versions.map((version, index) => (
            <LearningGameVersionRow
              key={version.id}
              version={version}
              index={index}
              coverImage={imageData}
              memoryTitle={memoryTitle || title}
              expanded={openVersionId === version.id}
              onToggle={(id) => setOpenVersionId((cur) => (cur === id ? null : id))}
              canDelete
              onDelete={handleDelete}
              playerHeight={height}
            />
          ))}
        </div>
      )}
    </div>
  );
}
