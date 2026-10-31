import { useMemo } from "react";
import { pairingQrShape } from "./pairing-qr-path";

export function PairingQrCode({
  link,
  label,
}: {
  link: string;
  label: string;
}) {
  const shape = useMemo(() => pairingQrShape(link), [link]);
  return (
    <svg
      aria-label={label}
      className="size-40 shrink-0 rounded-control"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${shape.size} ${shape.size}`}
    >
      <rect fill="#ffffff" height={shape.size} width={shape.size} />
      <path d={shape.path} fill="#000000" />
    </svg>
  );
}
