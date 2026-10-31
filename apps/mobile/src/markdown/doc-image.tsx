import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { RemoteImage } from "@/connection";
import { useSavedHosts } from "@/hosts";
import { space, useThemeColors } from "@/theme";

const ASPECT = { min: 0.5, max: 2, initial: 16 / 9 } as const;

function clampAspect(width: number, height: number) {
  if (width <= 0 || height <= 0) return ASPECT.initial;
  return Math.min(ASPECT.max, Math.max(ASPECT.min, width / height));
}

export function DocImage({
  hostId,
  fileName,
  alt,
}: {
  hostId: string;
  fileName: string;
  alt: string;
}) {
  const router = useRouter();
  const colors = useThemeColors();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  const [aspect, setAspect] = useState<number>(ASPECT.initial);
  if (!host) return null;
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={alt}
      testID="doc-image"
      onPress={() =>
        router.push({
          pathname: "/image/[hostId]",
          params: { hostId, filePath: fileName, name: alt || fileName },
        })
      }
      style={[styles.frame, { aspectRatio: aspect }]}
    >
      <RemoteImage
        hostId={hostId}
        request={{ kind: "imageAttachment", file: fileName }}
        resizeMode="contain"
        onLoad={({ nativeEvent }) =>
          setAspect(
            clampAspect(nativeEvent.source.width, nativeEvent.source.height),
          )
        }
        style={[styles.fill, { backgroundColor: colors.muted }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: space.sm,
  },
  fill: { width: "100%", height: "100%" },
});
