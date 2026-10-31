import { sentPromptPeek } from "@cocurdex/shared";
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
  ref,
}: {
  items: readonly CondensedItem[];
  footer?: ReactElement;
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
  const latestView = useRef<ComponentRef<typeof View>>(null);
  const indexFailed = useRef(false);
  const latestContent = useRef<{ id: string; height: number } | null>(null);
  const latestLayout = useRef<{ id: string; height: number } | null>(null);
  const navigation = useRef({
    sentMessageId,
    target: sentMessageId,
    initialPosition: !sentMessageId,
    retries: 0,
  });
  if (navigation.current.sentMessageId !== sentMessageId) {
    navigation.current = {
      sentMessageId,
      target: sentMessageId,
      initialPosition: false,
      retries: 0,
    };
  }
  const latestJump = useRef<{ animated: boolean } | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const visibleHeight = Math.max(0, viewportHeight - headerOverlap);
  const peek = sentPromptPeek(visibleHeight);
  const viewportWidth = useRef(0);
  const [jump, setJump] = useState(INITIAL_JUMP_STATE);
  const turns = useMemo(() => transcriptTurns(items), [items]);
  const history = useMemo(() => turns.slice(0, -1), [turns]);
  const latest = turns.at(-1);
  const streaming = items.some(
    (item) =>
      (item.kind === "activity" && item.running) ||
      (item.kind === "assistant" && item.streaming),
  );
  const directionOffset = useRef(0);
  const readingMetrics = (current: ScrollMetrics): ScrollMetrics => {
    const outer = latestLayout.current;
    const inner = latestContent.current;
    if (!latest || outer?.id !== latest.id || inner?.id !== latest.id) {
      return {
        ...current,
        contentHeight: current.offset + current.viewportHeight,
      };
    }
    return {
      ...current,
      contentHeight: Math.max(
        0,
        current.contentHeight -
          Math.max(0, outer.height - inner.height) -
          space.md,
      ),
    };
  };
  const refreshJump = () => {
    if (!metrics.current) return;
    const current = readingMetrics(metrics.current);
    setJump((state) =>
      nextJumpState(state, current, current.offset, items.length, streaming),
    );
  };
  const currentJump = metrics.current
    ? nextJumpState(
        jump,
        readingMetrics(metrics.current),
        metrics.current.offset,
        items.length,
        streaming,
      )
    : jump;

  const align = () => {
    const state = navigation.current;
    if (state.target) {
      const index = turns.findIndex((turn) =>
        turn.items.some((item) => item.id === state.target),
      );
      if (index === turns.length - 1 && metrics.current) {
        if (!latest || latestLayout.current?.id !== latest.id) return;
        const content = list.current?.getNativeScrollRef()?.getInnerViewRef();
        if (!content) return;
        const target = state.target;
        const inset =
          target === state.sentMessageId
            ? sentPromptPeek(metrics.current.viewportHeight - headerOverlap)
            : 0;
        latestView.current?.measureLayout(
          content,
          (_x, y) => {
            if (navigation.current.target !== target) return;
            list.current?.scrollToOffset({
              offset: Math.max(0, y - space.md - headerOverlap - inset),
              animated: false,
            });
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
        if (!indexFailed.current) state.target = undefined;
      }
    } else if (
      state.initialPosition &&
      metrics.current &&
      latest &&
      latestLayout.current?.id === latest.id
    ) {
      state.initialPosition = false;
      list.current?.scrollToOffset({
        offset: Math.max(
          0,
          metrics.current.contentHeight - metrics.current.viewportHeight,
        ),
        animated: false,
      });
    }
  };
  const scrollToLatest = (animated: boolean) => {
    if (!metrics.current) return;
    const current = readingMetrics(metrics.current);
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
      viewportHeight: layoutMeasurement.height,
    };
    const previous = directionOffset.current;
    if (Math.abs(next.offset - previous) >= 12)
      directionOffset.current = next.offset;
    metrics.current = next;
    const reading = readingMetrics(next);
    if (next.offset >= reading.contentHeight - reading.viewportHeight - 1)
      latestJump.current = null;
    setJump((current) =>
      nextJumpState(current, reading, previous, items.length, streaming),
    );
  };
  const jumpToLatest = () => {
    navigation.current.target = undefined;
    navigation.current.initialPosition = false;
    scrollToLatest(!reducedMotion);
  };
  const jumpToOldest = () => {
    latestJump.current = null;
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
        data={history}
        keyExtractor={(turn) => turn.id}
        extraData={[viewportHeight, renderRow, footer]}
        scrollsChildToFocus={false}
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: space.md + headerOverlap },
        ]}
        scrollEventThrottle={32}
        onScroll={onScroll}
        onScrollBeginDrag={() => {
          latestJump.current = null;
          navigation.current.target = undefined;
          navigation.current.initialPosition = false;
          indicator.onScrollBeginDrag();
          setJump((current) => ({ ...current, userScrolled: true }));
        }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          const resized = viewportWidth.current !== width;
          viewportWidth.current = width;
          setViewportHeight((previous) =>
            resized ? height : Math.max(previous, height),
          );
          if (metrics.current) metrics.current.viewportHeight = height;
          refreshJump();
        }}
        onContentSizeChange={(_width, height) => {
          const previous = metrics.current;
          const next = {
            offset: previous?.offset ?? 0,
            contentHeight: height,
            viewportHeight: previous?.viewportHeight ?? viewportHeight,
          };
          metrics.current = next;
          setJump((current) =>
            nextJumpState(
              current,
              readingMetrics(next),
              next.offset,
              items.length,
              streaming,
            ),
          );
          align();
          if (latestJump.current) scrollToLatest(latestJump.current.animated);
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          indexFailed.current = true;
          if (navigation.current.retries >= 12) return;
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
              style={[
                styles.turn,
                {
                  minHeight: Math.max(0, visibleHeight - space.md * 2 - peek),
                },
              ]}
              onLayout={(event) => {
                latestLayout.current = {
                  id: latest.id,
                  height: event.nativeEvent.layout.height,
                };
                refreshJump();
                align();
              }}
            >
              <View
                style={styles.turn}
                onLayout={(event) => {
                  latestContent.current = {
                    id: latest.id,
                    height: event.nativeEvent.layout.height,
                  };
                  refreshJump();
                }}
              >
                {latest.items.map(renderRow)}
                {footer}
              </View>
            </View>
          ) : (
            footer
          )
        }
      />
      {currentJump.kind ? (
        <JumpButton
          target={currentJump.kind}
          streaming={streaming}
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
  content: {
    paddingHorizontal: layout.sideMargin,
    paddingVertical: space.md,
    gap: space.md,
  },
  turn: { gap: space.md },
});
