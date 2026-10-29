import { useState } from 'react';
import { getGameStyle } from '../lib/gameStyles';
import { formatVersionDate } from '../lib/learningGame';
import { describeGameSource } from '../lib/gameRenderers';
import LearningGamePlayer from './LearningGamePlayer';

// LearningGameVersionRow — một dòng/phiên bản game trong danh sách version.
// Hiển thị số phiên bản, phong cách chơi, thời điểm tạo, nguồn AI; cho phép
// mở rộng để chơi ngay và xoá phiên bản với hộp xác nhận Yes/No (không xoá
// nhầm chỉ với một cú chạm).
export default function LearningGameVersionRow({
  version,
  index,
  coverImage = null,
  memoryTitle = '',
  expanded = false,
  onToggle,
  canDelete = false,
  onDelete,
  playerHeight = 380,
}) {
  const [confirming, setConfirming] = useState(false);
  const style = getGameStyle(version.style);

  const handleYes = () => {
    setConfirming(false);
    onDelete?.(version.id);
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--paper-white)', border: '1px solid var(--soft-beige)' }}
    >
      {/* Header dòng phiên bản */}
      <div className="flex items-center justify-between gap-2 p-3 flex-wrap">
        <button
          type="button"
          onClick={() => onToggle?.(version.id)}
          className="flex items-center gap-2.5 min-w-0 text-left flex-1"
          aria-expanded={expanded}
        >
          <span
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base"
            style={{ background: 'var(--warm-cream)' }}
          >
            {style.emoji}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold truncate" style={{ color: 'var(--deep-brown)' }}>
              Phiên bản {index + 1} · {style.label}
            </span>
            <span className="block text-xs truncate" style={{ color: 'var(--warm-brown)' }}>
              {version.title || style.label} · {formatVersionDate(version.createdAt)}
              {version.source ? ` · ${describeGameSource(version.source)}` : ''}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => onToggle?.(version.id)}
            className="px-3 py-1.5 rounded-full text-xs font-medium text-white transition-all duration-200 hover:shadow-md"
            style={{ background: 'var(--sage-green)' }}
          >
            {expanded ? '▾ Thu gọn' : '▶ Chơi'}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:shadow-md"
              style={{ background: '#fdeaea', color: '#a33', border: '1px solid #f3c9c4' }}
              title="Xoá phiên bản này"
            >
              🗑 Xoá
            </button>
          )}
        </div>
      </div>

      {version.spec?.customDescription && <p className="px-3 pb-3 text-sm whitespace-pre-wrap"><strong>Thể loại tự mô tả:</strong> {version.spec.customDescription}<br /><span className="text-xs">Cơ chế: di chuyển, thu thập và né vật thể.</span></p>}
      {/* Hộp xác nhận Yes/No */}
      {confirming && (
        <div className="px-3 pb-3">
          <div
            className="rounded-lg p-3"
            style={{ background: '#fdeaea', border: '1px solid #f3c9c4' }}
          >
            <p className="text-sm mb-3" style={{ color: '#8a3a30' }}>
              Bạn có chắc muốn xoá <strong>Phiên bản {index + 1} ({style.label})</strong>? Hành động này không thể hoàn tác.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
                style={{ background: 'var(--paper-white)', color: 'var(--warm-brown)', border: '1px solid var(--soft-beige)' }}
              >
                No – Huỷ
              </button>
              <button
                type="button"
                onClick={handleYes}
                className="px-4 py-2 rounded-full text-sm font-medium text-white transition-all duration-200 hover:shadow-md"
                style={{ background: '#c2564a' }}
              >
                Yes – Xoá
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Khung chơi game (tap-to-load gate nằm bên trong LearningGamePlayer) */}
      {expanded && (
        <div className="px-3 pb-3">
          <LearningGamePlayer
            spec={version.spec}
            coverImage={coverImage}
            memoryTitle={memoryTitle}
            source={version.source}
            height={playerHeight}
          />
        </div>
      )}
    </div>
  );
}
