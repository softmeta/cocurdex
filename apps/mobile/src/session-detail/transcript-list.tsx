import {
  type ComponentRef,
  type ReactElement,
  type Ref,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { layout, space } from "@/theme";
import { useHeaderOverlap, useScrollIndicatorWhileScrolling } from "@/ui";
import { JumpButton } from "./jump-button";
import type { CondensedItem } from "./transcript-activity";
import {
  hasUnseenLatest,
  INITIAL_JUMP_STATE,
  isFarFromOldest,
  nextJumpState,
  type ScrollMetrics,
  transcriptEdges,
} from "./transcript-jump";
import { type TranscriptTurn, transcriptTurns } from "./transcript-turns";

export interface TranscriptHandle {
  jumpToItem(id: string): void;
}

export function TranscriptList({
  items,
  footer,
  renderRow,
  sentMessageId,
  bottomInset = 0,
  onReachOldest,
  ref,
}: {
  items: readonly CondensedItem[];
  onReachOldest?: () => void;
  footer?: ReactElement;
  bottomInset?: number;
  renderRow: (item: CondensedItem) => ReactElement;
  sentMessageId?: string;
  ref?: Ref<TranscriptHandle>;
}) {
  const reducedMotion = useReducedMotion();
  const frame = useHeaderOverlap();
  const headerOverlap = frame.overlap;
  const indicator = useScrollIndicatorWhileScrolling();
  const list = useRef<FlatList<TranscriptTurn>>(null);
  const metrics = useRef<ScrollMetrics | null>(null);
  const listHeight = useRef(0);
  const latestView = useRef<ComponentRef<typeof View>>(null);
  const indexFailed = useRef(false);
  const latestLayoutId = useRef<string | null>(null);
  const following = useRef(true);
  const navigation = useRef<{
    sentMessageId?: string;
    target?: string;
    initialPosition: boolean;
    retries: number;
  }>({ sentMessageId, initialPosition: true, retries: 0 });
  if (navigation.current.sentMessageId !== sentMessageId) {
    navigation.current = {
      sentMessageId,
      initialPosition: true,
      retries: 0,
    };
    following.current = true;
  }
  const latestJump = useRef<{ animated: boolean } | null>(null);
  const [jump, setJump] = useState(INITIAL_JUMP_STATE);
  const [placed, setPlaced] = useState(false);
  const turns = useMemo(() => transcriptTurns(items), [items]);
  const history = useMemo(() => turns.slice(0, -1), [turns]);
  const latest = turns.at(-1);
  const streaming = items.some(
    (item) =>
      (item.kind === "activity" && item.running) ||
      (item.kind === "assistant" && item.streaming),
  );
  const directionOffset = useRef(0);
  const refreshJump = () => {
    const current = metrics.current;
    if (!current) return;
    setJump((state) =>
      nextJumpState(state, current, current.offset, items.length, streaming),
    );
  };
  const currentJump = metrics.current
    ? nextJumpState(
        jump,
        metrics.current,
        metrics.current.offset,
        items.length,
        streaming,
      )
    : jump;

  const scrollInstantly = (offset: number) => {
    list.current?.scrollToOffset({ offset, animated: false });
    if (metrics.current) metrics.current = { ...metrics.current, offset };
  };
  const align = () => {
    const state = navigation.current;
    if (state.target) {
      const index = turns.findIndex((turn) =>
        turn.items.some((item) => item.id === state.target),
      );
      if (index === turns.length - 1 && metrics.current) {
        if (!latest || latestLayoutId.current !== latest.id) return;
        const content = list.current?.getNativeScrollRef()?.getInnerViewRef();
        if (!content) return;
        const target = state.target;
        latestView.current?.measureLayout(
          content,
          (_x, y) => {
            if (navigation.current.target !== target) return;
            scrollInstantly(Math.max(0, y - space.md - headerOverlap));
            setPlaced(true);
          },
          () => {},
        );
      } else if (index >= 0) {
        indexFailed.current = false;
        list.current?.scrollToIndex({
          index,
          viewPosition: 0,
          viewOffset: space.md + headerOverlap,
          animated: false,
        });
        if (!indexFailed.current) {
          state.target = undefined;
          setPlaced(true);
        }
      } else {
        setPlaced(true);
      }
    } else if (
      state.initialPosition &&
      metrics.current &&
      latest &&
      latestLayoutId.current === latest.id
    ) {
      state.initialPosition = false;
      scrollInstantly(
        Math.max(
          0,
          metrics.current.contentHeight - metrics.current.viewportHeight,
        ),
      );
      setPlaced(true);
    }
  };
  const scrollToLatest = (animated: boolean) => {
    const current = metrics.current;
    if (!current) return;
    const offset = Math.max(0, current.contentHeight - current.viewportHeight);
    if (current.offset >= offset - 1) {
      latestJump.current = null;
      return;
    }
    latestJump.current = { animated };
    const glideStart = offset - current.viewportHeight;
    if (animated && current.offset < glideStart)
      list.current?.scrollToOffset({ offset: glideStart, animated: false });
    list.current?.scrollToOffset({ offset, animated });
  };
  useImperativeHandle(ref, () => ({
    jumpToItem(id) {
      latestJump.current = null;
      following.current = false;
      navigation.current.target = id;
      navigation.current.initialPosition = false;
      navigation.current.retries = 0;
      align();
    },
  }));
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const next = {
      offset: contentOffset.y,
      contentHeight: contentSize.height,
      viewportHeight: listHeight.current || layoutMeasurement.height,
    };
    const previous = directionOffset.current;
    if (Math.abs(next.offset - previous) >= 12)
      directionOffset.current = next.offset;
    metrics.current = next;
    const atLatest = transcriptEdges(next).nearLatest;
    if (atLatest) latestJump.current = null;
    if (!latestJump.current) following.current = atLatest;
    setJump((current) =>
      nextJumpState(current, next, previous, items.length, streaming),
    );
  };
  const jumpToLatest = () => {
    navigation.current.target = undefined;
    navigation.current.initialPosition = false;
    scrollToLatest(!reducedMotion);
  };
  const jumpToOldest = () => {
    latestJump.current = null;
    following.current = false;
    navigation.current.target = undefined;
    navigation.current.initialPosition = false;
    list.current?.scrollToOffset({
      offset: 0,
      animated: metrics.current !== null && !isFarFromOldest(metrics.current),
    });
  };
  return (
    <View ref={frame.ref} style={styles.fill} onLayout={frame.onLayout}>
      <FlatList
        {...indicator}
        ref={list}
        style={!placed && latest ? styles.placing : undefined}
        data={history}
        keyExtractor={(turn) => turn.id}
        extraData={[renderRow, footer]}
        scrollsChildToFocus={false}
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: space.md + headerOverlap,
            paddingBottom: space.md + bottomInset,
          },
        ]}
        scrollEventThrottle={32}
        onScroll={onScroll}
        maintainVisibleContentPosition={
          onReachOldest ? { minIndexForVisible: 0 } : undefined
        }
        onStartReached={() => {
          if (jump.userScrolled) onReachOldest?.();
        }}
        onScrollBeginDrag={() => {
          latestJump.current = null;
          following.current = false;
          navigation.current.target = undefined;
          navigation.current.initialPosition = false;
          setPlaced(true);
          indicator.onScrollBeginDrag();
          setJump((current) => ({ ...current, userScrolled: true }));
        }}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          listHeight.current = height;
          if (metrics.current) metrics.current.viewportHeight = height;
          refreshJump();
          if (following.current && placed && !latestJump.current)
            requestAnimationFrame(() => {
              if (following.current) scrollToLatest(false);
            });
        }}
        onContentSizeChange={(_width, height) => {
          const previous = metrics.current;
          const next = {
            offset: previous?.offset ?? 0,
            contentHeight: height,
            viewportHeight: previous?.viewportHeight ?? listHeight.current,
          };
          metrics.current = next;
          setJump((current) =>
            nextJumpState(current, next, next.offset, items.length, streaming),
          );
          align();
          if (latestJump.current) scrollToLatest(latestJump.current.animated);
          else if (following.current && placed) scrollToLatest(false);
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          indexFailed.current = true;
          if (navigation.current.retries >= 12) {
            setPlaced(true);
            return;
          }
          navigation.current.retries += 1;
          list.current?.scrollToOffset({
            offset: averageItemLength * index,
            animated: false,
          });
          requestAnimationFrame(align);
        }}
        renderItem={({ item }) => (
          <View testID={`transcript-turn-${item.id}`} style={styles.turn}>
            {item.items.map(renderRow)}
          </View>
        )}
        ListFooterComponent={
          latest ? (
            <View
              key={latest.id}
              ref={latestView}
              testID={`transcript-turn-${latest.id}`}
              style={styles.turn}
              onLayout={() => {
                latestLayoutId.current = latest.id;
                refreshJump();
                align();
              }}
            >
              {latest.items.map(renderRow)}
              {footer}
            </View>
          ) : (
            footer
          )
        }
      />
      {placed && currentJump.kind ? (
        <JumpButton
          target={currentJump.kind}
          streaming={streaming}
          bottomInset={bottomInset}
          unseen={
            currentJump.kind === "latest" && hasUnseenLatest(jump, items.length)
          }
          onPress={currentJump.kind === "latest" ? jumpToLatest : jumpToOldest}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  placing: { opacity: 0 },
  content: {
    paddingHorizontal: layout.sideMargin,
    paddingVertical: space.md,
    gap: space.md,
  },
  turn: { gap: space.md },
});
