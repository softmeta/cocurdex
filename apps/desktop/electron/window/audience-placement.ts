export interface PlacementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacementDisplay {
  id: number;
  bounds: PlacementRect;
  workArea: PlacementRect;
}

export interface AudiencePlacement {
  bounds: PlacementRect;
  fullscreen: boolean;
}

const WINDOWED_WIDTH = 960;
const WINDOWED_HEIGHT = 540;

export function audienceWindowPlacement(
  displays: PlacementDisplay[],
  presenterDisplayId: number,
): AudiencePlacement {
  const external = displays.find(
    (display) => display.id !== presenterDisplayId,
  );
  if (external) return { bounds: external.bounds, fullscreen: true };
  const current =
    displays.find((display) => display.id === presenterDisplayId) ??
    displays[0];
  const area = current?.workArea ?? {
    x: 0,
    y: 0,
    width: WINDOWED_WIDTH,
    height: WINDOWED_HEIGHT,
  };
  const width = Math.min(WINDOWED_WIDTH, area.width);
  const height = Math.min(WINDOWED_HEIGHT, area.height);
  return {
    bounds: {
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
    },
    fullscreen: false,
  };
}
