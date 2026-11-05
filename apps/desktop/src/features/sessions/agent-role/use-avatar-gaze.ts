import type { PointerEvent } from "react";

const MAX_LOOK = 1.6;
const MAX_LEAN_DEG = 6;
const REACH_X_PX = 120;
const REACH_Y_PX = 24;

function aim(avatar: HTMLElement, clientX: number, clientY: number) {
  const box = avatar.getBoundingClientRect();
  const rawX = (clientX - (box.left + box.width / 2)) / REACH_X_PX;
  const rawY = (clientY - (box.top + box.height / 2)) / REACH_Y_PX;
  const length = Math.hypot(rawX, rawY);
  const scale = length > 1 ? 1 / length : 1;
  const x = rawX * scale;
  const y = rawY * scale;
  return { x: x * MAX_LOOK, y: y * MAX_LOOK, lean: x * MAX_LEAN_DEG };
}

function setGaze(avatar: HTMLElement, x: number, y: number, lean: number) {
  avatar.style.setProperty("--avatar-look-x", x.toFixed(2));
  avatar.style.setProperty("--avatar-look-y", y.toFixed(2));
  avatar.style.setProperty("--avatar-lean", `${lean.toFixed(2)}deg`);
}

function restGaze(avatar: HTMLElement) {
  avatar.style.removeProperty("--avatar-look-x");
  avatar.style.removeProperty("--avatar-look-y");
  avatar.style.removeProperty("--avatar-lean");
}

const pendingFrames = new WeakMap<HTMLElement, number>();

function avatarsIn(target: HTMLElement) {
  return target.querySelectorAll<HTMLElement>("[data-avatar]");
}

export function useAvatarGaze() {
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const { clientX, clientY } = event;
    if (pendingFrames.has(target)) return;
    pendingFrames.set(
      target,
      requestAnimationFrame(() => {
        pendingFrames.delete(target);
        for (const avatar of avatarsIn(target)) {
          const { x, y, lean } = aim(avatar, clientX, clientY);
          setGaze(avatar, x, y, lean);
        }
      }),
    );
  };

  const onPointerLeave = (event: PointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const frame = pendingFrames.get(target);
    if (frame !== undefined) cancelAnimationFrame(frame);
    pendingFrames.delete(target);
    for (const avatar of avatarsIn(target)) restGaze(avatar);
  };

  return { onPointerLeave, onPointerMove };
}
