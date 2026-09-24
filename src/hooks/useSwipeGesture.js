import { useRef } from 'react';

const IGNORED_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'];

// Horizontal swipe detection for touch screens (iPhone / iPad).
// - ignores gestures that start on form controls (text selection, cursor moves)
// - ignores mostly-vertical gestures, so normal scrolling never flips a page
const useSwipeGesture = (onSwipeLeft, onSwipeRight, threshold = 50) => {
  const start = useRef(null);
  const last = useRef(null);

  const onTouchStart = (e) => {
    const target = e.target;
    if (target && (IGNORED_TAGS.includes(target.tagName) || target.isContentEditable)) {
      start.current = null;
      return;
    }
    const t = e.targetTouches[0];
    start.current = { x: t.clientX, y: t.clientY };
    last.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchMove = (e) => {
    if (!start.current) return;
    const t = e.targetTouches[0];
    last.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = () => {
    if (!start.current || !last.current) return;

    const dx = start.current.x - last.current.x;
    const dy = start.current.y - last.current.y;
    start.current = null;

    // Must be far enough and clearly more horizontal than vertical
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    if (dx > 0 && onSwipeLeft) onSwipeLeft();
    if (dx < 0 && onSwipeRight) onSwipeRight();
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
};

export default useSwipeGesture;
