// Copy only content, never ownership, timestamps, or social metadata.
export function buildMemoryCopy(memory, userId, kind) {
  if (!userId || !memory.id || !['fork', 'remix'].includes(kind)) {
    throw new Error('Invalid memory copy');
  }
  const content = {};
  for (const key of ['title', 'story', 'location', 'imageType', 'imageData', 'videoUrl',
    'learningGameVersions', 'learningGame', 'learningGameSource']) {
    if (memory[key] !== undefined) content[key] = memory[key];
  }
  return {
    ...content,
    userId,
    title: `${memory.title || 'Kỷ niệm'} (${kind === 'fork' ? 'Fork' : 'Remix'})`,
    sourceMemoryId: memory.id,
    sourceUserId: memory.userId || null,
    derivationType: kind,
  };
}

export const memoryLink = (id) => `${window.location.origin}${window.location.pathname}#home?memory=${encodeURIComponent(id)}`;
