import { useState } from 'react';
import LearningGameVersionRow from './LearningGameVersionRow';
import { normalizeGameVersions } from '../lib/learningGame';

// LearningGameLibrary — danh sách phiên bản game ở CHẾ ĐỘ XEM (Journal view,
// MemoryDetailPanel view). Chỉ mở chơi, không tạo/không xoá (mọi thao tác chỉnh
// sửa nằm trong form edit). Tương thích ngược memory cũ chỉ có field đơn
// `learningGame` qua normalizeGameVersions().
export default function LearningGameLibrary({ memory, coverImage = null, height = 380 }) {
  const versions = normalizeGameVersions(memory);
  const [openVersionId, setOpenVersionId] = useState(null);

  if (versions.length === 0) return null;

  return (
    <div
      className="rounded-2xl p-3 sm:p-4"
      style={{ background: 'var(--warm-cream)', border: '1px solid var(--soft-beige)' }}
    >
      <div className="text-sm font-semibold flex items-center gap-1.5 mb-3" style={{ color: 'var(--deep-brown)' }}>
        🎮 Game giáo dục
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: 'var(--soft-beige)', color: 'var(--warm-brown)' }}
        >
          {versions.length} phiên bản
        </span>
      </div>
      <div className="space-y-2">
        {versions.map((version, index) => (
          <LearningGameVersionRow
            key={version.id}
            version={version}
            index={index}
            coverImage={coverImage ?? memory.imageData ?? null}
            memoryTitle={memory.title || ''}
            expanded={openVersionId === version.id}
            onToggle={(id) => setOpenVersionId((cur) => (cur === id ? null : id))}
            canDelete={false}
            playerHeight={height}
          />
        ))}
      </div>
    </div>
  );
}
