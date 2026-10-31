import { type AndroidSymbol, type SFSymbol, SymbolView } from "expo-symbols";
import { Fragment, type ReactElement, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  type HostInstance,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout, space, useThemeColors } from "@/theme";
import { useFloatingSurface } from "./floating-surface";
import { type MenuAnchor, menuTop } from "./menu-placement";

export type { MenuAnchor } from "./menu-placement";

const MENU_WIDTH = 260;
const RADIUS = 16;
const SETTLE_FRAMES = 30;

export interface AnchoredMenuItem {
  key: string;
  label: string;
  icon?: { ios: SFSymbol; android: AndroidSymbol };
  leading?: ReactElement;
  group?: string;
  destructive?: boolean;
  selected?: boolean;
  testID?: string;
  onPress(): void;
}

export interface AnchoredMenuRequest {
  title?: string | null;
  items: readonly AnchoredMenuItem[];
}

export function menuAnchor(event: GestureResponderEvent): MenuAnchor {
  return { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
}

function sameAnchor(a: MenuAnchor | null, b: MenuAnchor) {
  return a !== null && a.x === b.x && a.y === b.y && a.top === b.top;
}

export function measureAnchor(
  view: HostInstance | null,
  onAnchor: (anchor: MenuAnchor) => void,
) {
  if (!view) return;
  let previous: MenuAnchor | null = null;
  let frames = 0;
  const measure = () =>
    view.measureInWindow((x, y, width, height) => {
      const anchor = { x: x + width / 2, y: y + height, top: y };
      frames += 1;
      if (sameAnchor(previous, anchor) || frames >= SETTLE_FRAMES) {
        onAnchor(anchor);
        return;
      }
      previous = anchor;
      requestAnimationFrame(measure);
    });
  measure();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function useMenuFrame(anchor: MenuAnchor, height: number | null) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const width = Math.min(MENU_WIDTH, window.width - layout.sideMargin * 2);
  const left = clamp(
    anchor.x - width / 2,
    layout.sideMargin,
    window.width - layout.sideMargin - width,
  );
  const bounds = {
    top: insets.top + layout.sideMargin,
    bottom: window.height - insets.bottom - layout.sideMargin,
  };
  if (height === null) {
    return { left, width, top: anchor.y, maxHeight: undefined };
  }
  return {
    left,
    width,
    top: menuTop(anchor, height, bounds),
    maxHeight: bounds.bottom - bounds.top,
  };
}

const MENU_ITEM_ROLE = Platform.OS === "ios" ? "button" : "menuitem";

function MenuRow({ item }: { item: AnchoredMenuItem }) {
  const colors = useThemeColors();
  const color = item.destructive ? colors.destructive : colors.foreground;
  const iconColor = item.destructive
    ? colors.destructive
    : colors.mutedForeground;
  return (
    <Pressable
      accessibilityRole={MENU_ITEM_ROLE}
      accessibilityLabel={item.label}
      accessibilityState={{ selected: item.selected ?? false }}
      onPress={item.onPress}
      android_ripple={{ color: colors.muted }}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.muted },
      ]}
      testID={item.testID}
    >
      {item.leading ?? null}
      {item.icon && !item.leading ? (
        <SymbolView name={item.icon} size={20} tintColor={iconColor} />
      ) : null}
      <Text numberOfLines={1} style={[styles.label, { color }]}>
        {item.label}
      </Text>
      {item.selected ? (
        <SymbolView
          name={{ ios: "checkmark", android: "check" }}
          size={17}
          tintColor={colors.tint}
        />
      ) : null}
    </Pressable>
  );
}

function MenuPanel({
  anchor,
  request,
  testID,
}: {
  anchor: MenuAnchor;
  request: AnchoredMenuRequest;
  testID?: string;
}) {
  const colors = useThemeColors();
  const surface = useFloatingSurface();
  const [height, setHeight] = useState<number | null>(null);
  const frame = useMenuFrame(anchor, height);
  return (
    <View
      accessibilityRole="menu"
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={[
        styles.panel,
        surface,
        frame,
        height === null && styles.measuring,
      ]}
      testID={testID}
    >
      {request.title ? (
        <Text
          numberOfLines={2}
          style={[styles.title, { color: colors.mutedForeground }]}
        >
          {request.title}
        </Text>
      ) : null}
      {request.items.map((item, index) => {
        const previous = request.items[index - 1];
        const divided = previous !== undefined && previous.group !== item.group;
        return (
          <Fragment key={item.key}>
            {divided ? (
              <View
                style={[styles.divider, { backgroundColor: colors.border }]}
              />
            ) : null}
            <MenuRow item={item} />
          </Fragment>
        );
      })}
    </View>
  );
}

export function AnchoredMenu({
  anchor,
  request,
  onDismiss,
  onClosed,
  testID,
}: {
  anchor: MenuAnchor | null;
  request: AnchoredMenuRequest | null;
  onDismiss(): void;
  onClosed?(): void;
  testID?: string;
}) {
  const visible = anchor !== null && request !== null;
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onDismiss}
      onDismiss={onClosed}
    >
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no"
        onPress={onDismiss}
        style={styles.backdrop}
      />
      {visible ? (
        <MenuPanel
          key={`${anchor.x}:${anchor.y}`}
          anchor={anchor}
          request={request}
          testID={testID}
        />
      ) : null}
    </Modal>
  );
}

export function useAnchoredMenu(testID?: string) {
  const [state, setState] = useState<{
    anchor: MenuAnchor;
    request: AnchoredMenuRequest;
  } | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const close = () => setState(null);
  const open = (anchor: MenuAnchor, request: AnchoredMenuRequest) =>
    setState({ anchor, request });
  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };
  const choose = (action: () => void) => {
    close();
    if (Platform.OS !== "ios") return action();
    pending.current = action;
  };
  const request = state
    ? {
        ...state.request,
        items: state.request.items.map((item) => ({
          ...item,
          onPress: () => choose(item.onPress),
        })),
      }
    : null;
  const menu = (
    <AnchoredMenu
      anchor={state?.anchor ?? null}
      request={request}
      onDismiss={close}
      onClosed={runPending}
      testID={testID}
    />
  );
  return { menu, open, close };
}

const styles = StyleSheet.create({
  backdrop: StyleSheet.absoluteFill,
  panel: {
    position: "absolute",
    borderRadius: RADIUS,
    paddingVertical: space.xs,
  },
  measuring: { opacity: 0 },
  title: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  label: { flex: 1, fontSize: 16, lineHeight: 22 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: space.xs,
  },
});
