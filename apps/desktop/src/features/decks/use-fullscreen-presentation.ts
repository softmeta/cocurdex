import { type RefObject, useEffect, useRef } from "react";

export function useFullscreenPresentation(
  ref: RefObject<HTMLElement | null>,
  onExit: () => void,
) {
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element?.requestFullscreen) return;
    let entered = false;
    const handleChange = () => {
      if (document.fullscreenElement === element) {
        entered = true;
        return;
      }
      if (entered) onExitRef.current();
    };
    document.addEventListener("fullscreenchange", handleChange);
    void element.requestFullscreen().catch(() => {});
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      if (document.fullscreenElement === element)
        void document.exitFullscreen();
    };
  }, [ref]);
}
