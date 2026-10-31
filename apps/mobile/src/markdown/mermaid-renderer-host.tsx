import {
  type ComponentRef,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import {
  allowsMermaidNavigation,
  parseMermaidMessage,
} from "./mermaid-document";
import { MERMAID_RUNTIME_HTML } from "./mermaid-runtime.generated";
import { mermaidRenderer } from "./mermaid-store";

const RUNTIME_SOURCE = { html: MERMAID_RUNTIME_HTML };

function RendererWebView() {
  const webView = useRef<ComponentRef<typeof WebView>>(null);
  const [generation, setGeneration] = useState(0);
  const restart = () => {
    mermaidRenderer.detach();
    setGeneration((value) => value + 1);
  };
  return (
    <View style={styles.renderer} pointerEvents="none">
      <WebView
        key={generation}
        ref={webView}
        source={RUNTIME_SOURCE}
        originWhitelist={["about:blank"]}
        scrollEnabled={false}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        onShouldStartLoadWithRequest={({ url }) => allowsMermaidNavigation(url)}
        onContentProcessDidTerminate={restart}
        onRenderProcessGone={restart}
        onMessage={({ nativeEvent }) => {
          const message = parseMermaidMessage(nativeEvent.data);
          if (!message) return;
          if (message.type !== "ready") return mermaidRenderer.receive(message);
          mermaidRenderer.attach((script) =>
            webView.current?.injectJavaScript(script),
          );
        }}
      />
    </View>
  );
}

export function MermaidRendererHost() {
  const active = useSyncExternalStore(
    mermaidRenderer.subscribe,
    mermaidRenderer.isActive,
  );
  return active ? <RendererWebView /> : null;
}

const styles = StyleSheet.create({
  renderer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    opacity: 0,
  },
});
