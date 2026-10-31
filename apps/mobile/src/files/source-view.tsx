import { memo, type ReactElement, useMemo, useRef, useState } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MONO_FONT } from "@/markdown";
import { scaledSize, useCodeScale } from "@/preferences";
import { layout, space, useThemeColors } from "@/theme";
import { useScrollIndicatorWhileScrolling } from "@/ui";
import { expandTabs, sourceColumns } from "./source-columns";
import {
  type SourceScheme,
  type SourceTokens,
  useSourceTokens,
} from "./source-highlight";

const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const LINES_ABOVE_FOCUS = 40;
const LINES_PER_PREPEND = 200;
const LINES_BELOW_FIRST_SCREEN = 40;
const FOCUS_VIEW_POSITION = 0.3;
const BASE_LINE_HEIGHT = 20;
const LINES_HIGHLIGHTED_AHEAD = 80;
const WINDOW_SCREENS = 5;
const BASE_CODE_FONT_SIZE = 13;
const BASE_NUMBER_FONT_SIZE = 12;
const CHAR_WIDTH_PER_POINT = 0.61;
const MAX_COLUMNS = 400;
const GUTTER_DIGIT_WIDTH = 8;

interface SourceMetrics {
  code: number;
  number: number;
  lineHeight: number;
  charWidth: number;
  digitWidth: number;
}

function sourceMetrics(scale: number): SourceMetrics {
  const code = scaledSize(BASE_CODE_FONT_SIZE, scale);
  return {
    code,
    number: scaledSize(BASE_NUMBER_FONT_SIZE, scale),
    lineHeight: scaledSize(BASE_LINE_HEIGHT, scale),
    charWidth: code * CHAR_WIDTH_PER_POINT,
    digitWidth: GUTTER_DIGIT_WIDTH * scale,
  };
}

function gutterWidth(digits: number, metrics: SourceMetrics) {
  return digits * metrics.digitWidth + space.sm;
}

const SourceLine = memo(function SourceLine({
  index,
  line,
  tokens,
  digits,
  focused,
  metrics,
}: {
  index: number;
  line: string;
  tokens: SourceTokens[number] | undefined;
  digits: number;
  focused: boolean;
  metrics: SourceMetrics;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={[styles.line, focused && { backgroundColor: colors.muted }]}
      testID={focused ? "source-focused-line" : undefined}
    >
      <Text
        style={[
          styles.number,
          {
            width: gutterWidth(digits, metrics),
            color: colors.mutedForeground,
            fontSize: metrics.number,
            lineHeight: metrics.lineHeight,
          },
        ]}
      >
        {index + 1}
      </Text>
      <Text
        selectable
        style={[
          styles.code,
          {
            color: colors.foreground,
            fontSize: metrics.code,
            lineHeight: metrics.lineHeight,
          },
        ]}
      >
        {tokens
          ? tokens.map((token, at) => (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional within a fixed line
                key={at}
                style={{
                  color: token.color,
                  fontStyle:
                    (token.fontStyle ?? 0) & FONT_STYLE_ITALIC
                      ? "italic"
                      : "normal",
                  fontWeight:
                    (token.fontStyle ?? 0) & FONT_STYLE_BOLD ? "600" : "400",
                }}
              >
                {expandTabs(token.content)}
              </Text>
            ))
          : expandTabs(line) || " "}
      </Text>
    </View>
  );
});

function firstRenderedLine(focusIndex: number | null) {
  return focusIndex === null ? 0 : Math.max(0, focusIndex - LINES_ABOVE_FOCUS);
}

export function SourceView({
  fileKey,
  lines,
  language,
  scheme,
  focusLine,
  footer,
}: {
  fileKey: string;
  lines: readonly string[];
  language: string | null;
  scheme: SourceScheme;
  focusLine: number | null;
  footer?: ReactElement | null;
}) {
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const { tokens, request } = useSourceTokens(fileKey, lines, language, scheme);
  const list = useRef<FlatList<string>>(null);
  const revealed = useRef(false);
  const digits = String(lines.length).length;
  const { width: windowWidth } = useWindowDimensions();
  const codeScale = useCodeScale();
  const metrics = useMemo(() => sourceMetrics(codeScale), [codeScale]);
  const columns = useMemo(
    () => Math.min(sourceColumns(lines), MAX_COLUMNS),
    [lines],
  );
  const contentWidth = Math.max(
    windowWidth,
    Math.ceil(
      space.sm +
        gutterWidth(digits, metrics) +
        space.md +
        columns * metrics.charWidth +
        layout.sideMargin,
    ),
  );
  const focusIndex =
    focusLine !== null && focusLine >= 1 && focusLine <= lines.length
      ? focusLine - 1
      : null;

  const [firstLine, setFirstLine] = useState(() =>
    firstRenderedLine(focusIndex),
  );
  const rendered = useMemo(
    () => (firstLine === 0 ? lines : lines.slice(firstLine)),
    [lines, firstLine],
  );
  const focusRow = focusIndex === null ? null : focusIndex - firstLine;

  const scrollToFocus = (row: number) =>
    list.current?.scrollToIndex({
      index: row,
      viewPosition: FOCUS_VIEW_POSITION,
      animated: false,
    });

  const reveal = () => {
    if (revealed.current || focusRow === null) return;
    revealed.current = true;
    scrollToFocus(focusRow);
  };

  const highlightThrough = (offset: number, viewport: number) =>
    request(
      firstLine +
        Math.ceil((offset + viewport) / metrics.lineHeight) +
        LINES_HIGHLIGHTED_AHEAD,
    );

  const prependEarlierLines = () => {
    if (!revealed.current || firstLine === 0) return;
    setFirstLine(Math.max(0, firstLine - LINES_PER_PREPEND));
  };

  return (
    <ScrollView
      horizontal
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      testID="source-horizontal-scroll"
    >
      <FlatList
        {...scrollIndicator}
        ref={list}
        style={{ width: contentWidth }}
        data={rendered as string[]}
        extraData={[tokens, metrics]}
        keyExtractor={(_line, row) => String(firstLine + row)}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        scrollsChildToFocus={false}
        initialNumToRender={(focusRow ?? 0) + LINES_BELOW_FIRST_SCREEN}
        windowSize={WINDOW_SCREENS}
        maintainVisibleContentPosition={
          firstLine > 0 ? { minIndexForVisible: 0 } : undefined
        }
        onStartReached={prependEarlierLines}
        onContentSizeChange={() => {
          reveal();
          request(
            (focusIndex ?? 0) +
              LINES_BELOW_FIRST_SCREEN +
              LINES_HIGHLIGHTED_AHEAD,
          );
        }}
        onScroll={({ nativeEvent }) =>
          highlightThrough(
            nativeEvent.contentOffset.y,
            nativeEvent.layoutMeasurement.height,
          )
        }
        scrollEventThrottle={100}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          list.current?.scrollToOffset({
            offset: index * averageItemLength,
            animated: false,
          });
          requestAnimationFrame(() => scrollToFocus(index));
        }}
        ListFooterComponent={footer ?? undefined}
        renderItem={({ item, index: row }: ListRenderItemInfo<string>) => {
          const index = firstLine + row;
          return (
            <SourceLine
              index={index}
              line={item}
              tokens={tokens[index]}
              digits={digits}
              focused={index === focusIndex}
              metrics={metrics}
            />
          );
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: space.sm },
  line: {
    flexDirection: "row",
    paddingRight: layout.sideMargin,
    paddingLeft: space.sm,
  },
  number: {
    fontFamily: MONO_FONT,
    textAlign: "right",
    marginRight: space.md,
  },
  code: {
    flex: 1,
    fontFamily: MONO_FONT,
  },
});
