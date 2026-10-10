// Swipe between weeks. Prev/Next are real links, so this is only a shortcut:
// a horizontal swipe follows the matching link; vertical scrolling (even with
// sideways drift) does nothing.

// "next" for a left swipe, "prev" for a right swipe, null for anything else.
export function classifySwipe(dx, dy) {
  if (Math.abs(dx) <= 60 || Math.abs(dx) <= 2 * Math.abs(dy)) return null;
  return dx < 0 ? "next" : "prev";
}

if (typeof document !== "undefined") {
  let start = null;
  document.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches[0];
      start = { x: t.clientX, y: t.clientY };
    },
    { passive: true },
  );
  document.addEventListener(
    "touchend",
    (e) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dir = classifySwipe(t.clientX - start.x, t.clientY - start.y);
      start = null;
      const link = dir && document.querySelector(`a[rel="${dir}"]`);
      if (link) window.location.href = link.href;
    },
    { passive: true },
  );
}
