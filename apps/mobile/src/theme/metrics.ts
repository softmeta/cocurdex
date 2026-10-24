export const space = {
  hairline: 1,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const layout = {
  sideMargin: 16,
  avatarTile: 36,
  bubbleMaxWidthRatio: 0.85,
  boardColumnPeek: 90,
} as const;

export const control = {
  standard: { height: 40, radius: 8 },
  compact: { height: 32, radius: 6 },
  hitArea: 44,
} as const;
