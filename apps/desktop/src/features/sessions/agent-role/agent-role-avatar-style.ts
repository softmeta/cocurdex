import {
  AGENT_ROLE_AVATAR_COLORS,
  type AgentRoleAvatarColor,
} from "@cocurdex/shared";

export const agentRoleAvatarColorClassName: Record<
  AgentRoleAvatarColor,
  string
> = {
  gray: "bg-role-avatar-gray/15 text-role-avatar-gray",
  red: "bg-role-avatar-red/15 text-role-avatar-red",
  orange: "bg-role-avatar-orange/15 text-role-avatar-orange",
  amber: "bg-role-avatar-amber/15 text-role-avatar-amber",
  green: "bg-role-avatar-green/15 text-role-avatar-green",
  teal: "bg-role-avatar-teal/15 text-role-avatar-teal",
  blue: "bg-role-avatar-blue/15 text-role-avatar-blue",
  violet: "bg-role-avatar-violet/15 text-role-avatar-violet",
  pink: "bg-role-avatar-pink/15 text-role-avatar-pink",
};

export const agentRoleAvatarSwatchClassName: Record<
  AgentRoleAvatarColor,
  string
> = {
  gray: "bg-role-avatar-gray",
  red: "bg-role-avatar-red",
  orange: "bg-role-avatar-orange",
  amber: "bg-role-avatar-amber",
  green: "bg-role-avatar-green",
  teal: "bg-role-avatar-teal",
  blue: "bg-role-avatar-blue",
  violet: "bg-role-avatar-violet",
  pink: "bg-role-avatar-pink",
};

export const AGENT_ROLE_AVATAR_EMOJI_GROUPS = [
  {
    id: "people",
    emojis: [
      "🧑‍💻",
      "🧑‍🔬",
      "🧑‍🏫",
      "🧑‍🎨",
      "🧑‍🚀",
      "🧑‍🔧",
      "🧑‍⚖️",
      "🧑‍🍳",
      "🕵️",
      "🥷",
      "🧙",
      "🧝",
      "🧛",
      "🧞",
      "🦸",
      "🦹",
      "👷",
      "💂",
      "🧑‍✈️",
      "🧑‍🚒",
      "🤠",
      "🤖",
      "👾",
      "👻",
    ],
  },
  {
    id: "animals",
    emojis: [
      "🦊",
      "🐙",
      "🦉",
      "🐝",
      "🦄",
      "🐼",
      "🐯",
      "🦁",
      "🐺",
      "🐻",
      "🐨",
      "🐸",
      "🐧",
      "🦅",
      "🦜",
      "🐬",
      "🐳",
      "🦈",
      "🐢",
      "🦎",
      "🐉",
      "🦖",
      "🦋",
      "🐌",
    ],
  },
  {
    id: "symbols",
    emojis: [
      "🚀",
      "⚡",
      "🔥",
      "🌟",
      "✨",
      "🎯",
      "🧠",
      "💡",
      "🧭",
      "💎",
      "🌈",
      "🌊",
      "⛰️",
      "🌙",
      "☀️",
      "❄️",
      "🍀",
      "🌱",
      "🎲",
      "🧩",
      "🔮",
      "🎩",
      "👑",
      "⏱️",
    ],
  },
  {
    id: "work",
    emojis: [
      "🛠️",
      "🔧",
      "🔨",
      "⚙️",
      "🧪",
      "🔬",
      "🔭",
      "🔍",
      "📝",
      "📐",
      "📏",
      "🎨",
      "🧹",
      "🛡️",
      "🐛",
      "✅",
      "📦",
      "🏗️",
      "🔒",
      "🔑",
      "🌐",
      "☕",
      "📚",
      "🗂️",
    ],
  },
] as const;

export type AgentRoleAvatarEmojiGroupId =
  (typeof AGENT_ROLE_AVATAR_EMOJI_GROUPS)[number]["id"];

export function defaultAgentRoleAvatarColor(id: string): AgentRoleAvatarColor {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return AGENT_ROLE_AVATAR_COLORS[hash % AGENT_ROLE_AVATAR_COLORS.length];
}

export function agentRoleInitial(name: string) {
  const first = new Intl.Segmenter()
    .segment(name.trim())
    [Symbol.iterator]()
    .next().value?.segment;
  return first?.toLocaleUpperCase() ?? "?";
}
