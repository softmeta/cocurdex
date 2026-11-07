import type { AgentRoleAvatarColor } from "@cocurdex/shared";
import type { ThemeColors } from "@/theme";

export const AVATAR_COLOR: Record<AgentRoleAvatarColor, keyof ThemeColors> = {
  gray: "roleAvatarGray",
  red: "roleAvatarRed",
  orange: "roleAvatarOrange",
  amber: "roleAvatarAmber",
  green: "roleAvatarGreen",
  teal: "roleAvatarTeal",
  blue: "roleAvatarBlue",
  violet: "roleAvatarViolet",
  pink: "roleAvatarPink",
};
