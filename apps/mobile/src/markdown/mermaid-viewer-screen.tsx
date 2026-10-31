import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { useThemeColors, useThemeName } from "@/theme";
import { CloseButton } from "@/ui";
import { DiagramPreview } from "./diagram-preview";
import type { RenderedDiagram } from "./mermaid-cache";
import {
  allowsMermaidNavigation,
  mermaidViewerDocument,
} from "./mermaid-document";
import { diagramSource, useDiagram } from "./mermaid-store";

function FittedPreview({ diagram }: { diagram: RenderedDiagram }) {
  return (
    <View style={styles.loading} pointerEvents="none">
      <DiagramPreview diagram={diagram} />
    </View>
  );
}

function ZoomableDiagram({
  diagram,
  background,
}: {
  diagram: RenderedDiagram;
  background: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const source = useMemo(
    () => ({ html: mermaidViewerDocument(diagram.svg, background) }),
    [diagram.svg, background],
  );
  return (
    <>
      <WebView
        source={source}
        injectedJavaScript="requestAnimationFrame(() => requestAnimationFrame(() => window.ReactNativeWebView.postMessage('painted')));true;"
        onMessage={({ nativeEvent }) => {
          if (nativeEvent.data === "painted") setLoaded(true);
        }}
        originWhitelist={["about:blank"]}
        javaScriptEnabled
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        setBuiltInZoomControls
        setDisplayZoomControls={false}
        onShouldStartLoadWithRequest={({ url }) => allowsMermaidNavigation(url)}
        style={styles.webView}
      />
      {loaded ? null : (
        <View
          style={[styles.loading, { backgroundColor: background }]}
          pointerEvents="none"
          testID="mermaid-viewer-preview"
        >
          <FittedPreview diagram={diagram} />
        </View>
      )}
    </>
  );
}

function ThemedDiagram({
  source,
  background,
}: {
  source: string;
  background: string;
}) {
  const entry = useDiagram(source, useThemeName());
  if (entry?.kind !== "rendered") return null;
  return (
    <ZoomableDiagram
      key={`${entry.id}:${background}`}
      diagram={entry.diagram}
      background={background}
    />
  );
}

export function MermaidViewerScreen({
  diagramId,
  onClose,
}: {
  diagramId: string;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [source] = useState(() => diagramSource(diagramId));
  return (
    <>
      <CloseButton
        accessibilityLabel={t("markdown.closeDiagram")}
        onPress={onClose}
      />
      <View
        style={[styles.fill, { backgroundColor: colors.background }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t("markdown.diagram")}
        testID="mermaid-viewer"
      >
        {source === null ? null : (
          <ThemedDiagram source={source} background={colors.background} />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  webView: { flex: 1, backgroundColor: "transparent" },
  loading: { ...StyleSheet.absoluteFill },
});
