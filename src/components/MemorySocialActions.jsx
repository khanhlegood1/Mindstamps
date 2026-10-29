import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { buildMemoryCopy, memoryLink } from '../lib/memorySocial';

export default function MemorySocialActions({ memory, userId, onCopy }) {
  const [reactions, setReactions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setReactions([]);
    setMessage('');
    setShareUrl('');
    return onSnapshot(collection(db, 'memories', memory.id, 'reactions'),
      (snapshot) => setReactions(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))),
      () => setMessage('Không tải được lượt thích. Vui lòng thử lại.'));
  }, [memory.id]);

  const react = async (type) => {
    if (!userId || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const ref = doc(db, 'memories', memory.id, 'reactions', userId);
      const mine = reactions.find((item) => item.id === userId);
      if (mine?.type === type) await deleteDoc(ref);
      else await setDoc(ref, { type });
    } catch {
      setMessage('Không lưu được cảm xúc. Vui lòng thử lại.');
    } finally { setBusy(false); }
  };

  const copy = async (kind) => {
    if (!userId || busy) return;
    setBusy(true);
    setMessage('');
    try {
      // Always fetch the complete current source (including every game version).
      const source = await getDoc(doc(db, 'memories', memory.id));
      if (!source.exists()) throw new Error('missing');
      const data = { ...buildMemoryCopy({ ...source.data(), id: source.id }, userId, kind), createdAt: serverTimestamp() };
      const result = await addDoc(collection(db, 'memories'), data);
      onCopy({ ...data, id: result.id, createdAt: new Date() }, kind === 'remix');
    } catch {
      setMessage('Không tạo được bản sao. Vui lòng thử lại.');
    } finally { setBusy(false); }
  };

  const share = async () => {
    const url = memoryLink(memory.id);
    try {
      if (navigator.share) await navigator.share({ title: memory.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Đã sao chép liên kết chia sẻ.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') setShareUrl(url);
    }
  };

  return (
    <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--soft-beige)' }}>
      {memory.sourceMemoryId && <p className="text-xs">{memory.derivationType === 'remix' ? 'Remix' : 'Fork'} từ <a className="underline" href={memoryLink(memory.sourceMemoryId)}>kỷ niệm gốc</a></p>}
      <div className="flex flex-wrap gap-2">
        {['like', 'love'].map((type) => (
          <button key={type} type="button" disabled={busy || !userId}
            aria-pressed={reactions.some((item) => item.id === userId && item.type === type)}
            className="px-3 py-2 rounded-full border text-sm disabled:opacity-50 aria-pressed:bg-pink-100"
            onClick={() => react(type)}>
            {type === 'like' ? '👍 Like' : '❤️ Love'} · {reactions.filter((item) => item.type === type).length}
          </button>
        ))}
        <button type="button" className="px-3 py-2 rounded-full border text-sm" onClick={share}>↗ Share</button>
        <button type="button" disabled={busy || !userId} className="px-3 py-2 rounded-full border text-sm disabled:opacity-50" onClick={() => copy('fork')}>⑂ Fork</button>
        <button type="button" disabled={busy || !userId} className="px-3 py-2 rounded-full border text-sm disabled:opacity-50" onClick={() => copy('remix')}>🎨 Remix</button>
      </div>
      <p className="text-xs" style={{ color: 'var(--warm-brown)' }}>Fork: lưu bản sao của bạn. Remix: tạo bản sao rồi chỉnh sửa. Bản gốc không thay đổi.</p>
      {message && <p role="status" className="text-sm">{message}</p>}
      {shareUrl && <input aria-label="Liên kết chia sẻ" className="vintage-input w-full" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />}
    </div>
  );
}
