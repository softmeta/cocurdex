import { useRef, useState } from "react";

const HIDE_AFTER_SCROLL_MS = 800;

export function useScrollIndicatorWhileScrolling() {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  const show = () => {
    cancelHide();
    setVisible(true);
  };
  const hideLater = () => {
    cancelHide();
    hideTimer.current = setTimeout(
      () => setVisible(false),
      HIDE_AFTER_SCROLL_MS,
    );
  };
  return {
    showsVerticalScrollIndicator: visible,
    showsHorizontalScrollIndicator: visible,
    onScrollBeginDrag: show,
    onMomentumScrollBegin: show,
    onScrollEndDrag: hideLater,
    onMomentumScrollEnd: hideLater,
  };
}
