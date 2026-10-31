import { useMemo } from "react";
import { Image, StyleSheet } from "react-native";
import { SvgCss } from "react-native-svg/css";
import type { RenderedDiagram } from "./mermaid-cache";
import { withoutReversedMarkers } from "./svg-markers";

function NativeSvg({ svg }: { svg: string }) {
  const xml = useMemo(() => withoutReversedMarkers(svg), [svg]);
  return <SvgCss xml={xml} width="100%" height="100%" />;
}

export function DiagramPreview({ diagram }: { diagram: RenderedDiagram }) {
  if (!diagram.image) return <NativeSvg svg={diagram.svg} />;
  return (
    <Image
      source={{ uri: diagram.image }}
      style={styles.image}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%" },
});
