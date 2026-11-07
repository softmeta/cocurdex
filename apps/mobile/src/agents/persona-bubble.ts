import { resolveAgentRoleAvatar } from "@cocurdex/shared";
import { useMemo } from "react";
import { useThemeColors, useThemeName } from "@/theme";
import { AVATAR_COLOR } from "./avatar-hue";
import type { RoleAvatarSource } from "./role-avatar";

export interface BubbleColors {
  background: string;
  foreground: string;
}

const DARK_HUE_WEIGHT = 0.78;

function toLinear(channel: number) {
  const value = channel / 255;
  if (value <= 0.04045) return value / 12.92;
  return ((value + 0.055) / 1.055) ** 2.4;
}

function toChannel(linear: number) {
  const value =
    linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

export function mixWithBlackInOklab(hex: string, weight: number) {
  const rgb = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16),
  );
  const scale = weight ** 3;
  return `#${rgb
    .map((channel) => toChannel(toLinear(channel) * scale))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function usePersonaBubble(
  role: RoleAvatarSource | null,
): BubbleColors | null {
  const colors = useThemeColors();
  const theme = useThemeName();
  const hue = role
    ? colors[AVATAR_COLOR[resolveAgentRoleAvatar(role).color]]
    : null;
  const foreground = colors.roleAvatarFaceLight;
  return useMemo(() => {
    if (!hue) return null;
    const background =
      theme === "dark" ? mixWithBlackInOklab(hue, DARK_HUE_WEIGHT) : hue;
    return { background, foreground };
  }, [hue, theme, foreground]);
}
