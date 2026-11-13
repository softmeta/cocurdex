import { AGENT_ROLE_AVATAR_WORKING_MOTION as MOTION } from "@cocurdex/shared";
import { useCallback } from "react";

const EASING = "ease-in-out";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useWorkingMotion(working: boolean) {
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node || !working || prefersReducedMotion()) return;
      const bob = node.animate(
        [{ translate: "0 0" }, { translate: `0 ${-MOTION.bobShare * 100}%` }],
        {
          direction: "alternate",
          duration: MOTION.bobMs,
          easing: EASING,
          iterations: Number.POSITIVE_INFINITY,
        },
      );
      const face = node.querySelector<SVGGElement>("[data-avatar-face]");
      const glance = face?.animate(
        MOTION.glance.map((stop) => ({
          offset: stop.at,
          translate: `${stop.x}px 0`,
        })),
        {
          duration: MOTION.glanceMs,
          easing: EASING,
          iterations: Number.POSITIVE_INFINITY,
        },
      );
      return () => {
        bob.cancel();
        glance?.cancel();
      };
    },
    [working],
  );
}
