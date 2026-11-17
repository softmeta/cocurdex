import {
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

const MAX_INDEX_RETRIES = 12;
const KEEP_VISIBLE = { minIndexForVisible: 0 };

function topDownMetrics(
  fromLatest: number,
  contentHeight: number,
  viewportHeight: number,
): ScrollMetrics {
  return {
    offset: Math.max(0, contentHeight - viewportHeight - fromLatest),
    contentHeight,
    viewportHeight,
  };
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
  const scroll = useRef({ fromLatest: 0, contentHeight: 0, viewportHeight: 0 });
  const directionFrom = useRef(0);
  const target = useRef<{ id: string; retries: number } | null>(null);
  const toOldest = useRef(false);
  const sent = useRef(sentMessageId);
  const toLatestOnLayout = useRef(false);
  if (sent.current !== sentMessageId) {
    sent.current = sentMessageId;
    target.current = null;
    toOldest.current = false;
    toLatestOnLayout.current = true;
  }
  const [jump, setJump] = useState(INITIAL_JUMP_STATE);
  const turns = useMemo(() => transcriptTurns(items), [items]);
  const newestFirst = useMemo(() => [...turns].reverse(), [turns]);
  const streaming = items.some(
    (item) =>
      (item.kind === "activity" && item.running) ||
      (item.kind === "assistant" && item.streaming),
  );

  const metrics = () =>
    topDownMetrics(
      scroll.current.fromLatest,
      scroll.current.contentHeight,
      scroll.current.viewportHeight,
    );
  const refreshJump = () => {
    if (!scroll.current.viewportHeight) return;
    const next = metrics();
    setJump((state) =>
      nextJumpState(state, next, next.offset, items.length, streaming),
    );
  };

  const scrollToLatest = (animated: boolean) => {
    const { fromLatest, viewportHeight } = scroll.current;
    if (fromLatest <= 1) return;
    if (animated && fromLatest > viewportHeight)
      list.current?.scrollToOffset({ offset: viewportHeight, animated: false });
    list.current?.scrollToOffset({ offset: 0, animated });
  };
  const scrollToTarget = () => {
    const pending = target.current;
    if (!pending) return;
    const index = newestFirst.findIndex((turn) =>
      turn.items.some((item) => item.id === pending.id),
    );
    if (index < 0) {
      target.current = null;
      return;
    }
    list.current?.scrollToIndex({
      index,
      viewPosition: 1,
      viewOffset: -(space.md + headerOverlap),
      animated: false,
    });
  };
  useImperativeHandle(ref, () => ({
    jumpToItem(id) {
      toOldest.current = false;
      toLatestOnLayout.current = false;
      target.current = { id, retries: 0 };
      scrollToTarget();
    },
  }));

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const fromLatest = contentOffset.y;
    scroll.current = {
      fromLatest,
      contentHeight: contentSize.height,
      viewportHeight: scroll.current.viewportHeight || layoutMeasurement.height,
    };
    const previous = directionFrom.current;
    if (Math.abs(fromLatest - previous) >= 12)
      directionFrom.current = fromLatest;
    const next = metrics();
    setJump((current) =>
      nextJumpState(
        current,
        next,
        next.offset + fromLatest - previous,
        items.length,
        streaming,
      ),
    );
  };
  const jumpToLatest = () => {
    target.current = null;
    toOldest.current = false;
    scrollToLatest(!reducedMotion);
  };
  const jumpToOldest = () => {
    target.current = null;
    toOldest.current = true;
    list.current?.scrollToEnd({ animated: !isFarFromOldest(metrics()) });
  };
  const current = scroll.current.viewportHeight ? metrics() : null;
  const shown = current
    ? nextJumpState(jump, current, current.offset, items.length, streaming)
    : jump;
  const away = shown.awayFromLatestAt !== null;
  return (
    <View ref={frame.ref} style={styles.fill} onLayout={frame.onLayout}>
      <FlatList
        {...indicator}
        ref={list}
        inverted
        data={newestFirst}
        keyExtractor={(turn) => turn.id}
        extraData={renderRow}
        scrollsChildToFocus={false}
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: space.md + bottomInset,
            paddingBottom: space.md + headerOverlap,
          },
        ]}
        scrollEventThrottle={32}
        onScroll={onScroll}
        maintainVisibleContentPosition={away ? KEEP_VISIBLE : undefined}
        onEndReached={() => {
          if (jump.userScrolled) onReachOldest?.();
        }}
        onScrollBeginDrag={() => {
          target.current = null;
          toOldest.current = false;
          indicator.onScrollBeginDrag();
          setJump((current) => ({ ...current, userScrolled: true }));
        }}
        onLayout={(event) => {
          scroll.current.viewportHeight = event.nativeEvent.layout.height;
          refreshJump();
        }}
        onContentSizeChange={(_width, height) => {
          scroll.current.contentHeight = height;
          refreshJump();
          if (toLatestOnLayout.current) {
            toLatestOnLayout.current = false;
            scrollToLatest(false);
          } else if (target.current) {
            scrollToTarget();
          } else if (toOldest.current) {
            list.current?.scrollToEnd({ animated: false });
          }
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          const pending = target.current;
          if (!pending) return;
          if (pending.retries >= MAX_INDEX_RETRIES) {
            target.current = null;
            return;
          }
          pending.retries += 1;
          list.current?.scrollToOffset({
            offset: averageItemLength * index,
            animated: false,
          });
          requestAnimationFrame(scrollToTarget);
        }}
        renderItem={({ item }) => (
          <View testID={`transcript-turn-${item.id}`} style={styles.turn}>
            {item.items.map(renderRow)}
          </View>
        )}
        ListHeaderComponent={footer}
      />
      {shown.kind ? (
        <JumpButton
          target={shown.kind}
          streaming={streaming}
          bottomInset={bottomInset}
          unseen={
            shown.kind === "latest" && hasUnseenLatest(jump, items.length)
          }
          onPress={shown.kind === "latest" ? jumpToLatest : jumpToOldest}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: layout.sideMargin,
    gap: space.md,
  },
  turn: { gap: space.md },
});
