import type { ImageAttachment } from "@cocurdex/shared";
import { randomUUID } from "expo-crypto";
import { SymbolView } from "expo-symbols";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { layout, space, useThemeColors } from "@/theme";
import { useFloatingSurface } from "@/ui";
import { AttachmentStrip, type DraftImage } from "./attachment-strip";
import { MAX_IMAGES_PER_MESSAGE, type PickedImage } from "./image-attachments";
import {
  ImageUploadError,
  type ImageUploadFailure,
} from "./image-upload-response";

interface Draft extends DraftImage {
  attachment: ImageAttachment | null;
}

export interface ComposerProps {
  running: boolean;
  canSend: boolean;
  canEdit?: boolean;
  onSend(text: string, images: ImageAttachment[]): Promise<boolean>;
  onStop(): void;
  onPickImages(limit: number): Promise<PickedImage[]>;
  onUploadImage(image: PickedImage): Promise<ImageAttachment>;
  placeholder?: string;
  inputTestID?: string;
  autoFocus?: boolean;
  accessory?: ReactNode;
}

function uploadFailure(error: unknown): ImageUploadFailure {
  return error instanceof ImageUploadError ? error.reason : "failed";
}

function useUploadFailureMessages(): Record<ImageUploadFailure, string> {
  const { t } = useTranslation("sessions");
  return {
    tooLarge: t("composer.imageTooLarge"),
    unsupported: t("composer.imageUnsupported"),
    failed: t("composer.imageFailed"),
  };
}

export function Composer({
  running,
  canSend,
  canEdit = canSend,
  onSend,
  onStop,
  onPickImages,
  onUploadImage,
  placeholder,
  inputTestID = "composer-input",
  autoFocus = false,
  accessory,
}: ComposerProps) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const floatingSurface = useFloatingSurface();
  const failureMessages = useUploadFailureMessages();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [failure, setFailure] = useState<ImageUploadFailure | null>(null);
  const [sending, setSending] = useState(false);
  const ready = drafts.flatMap((draft) =>
    draft.attachment ? [draft.attachment] : [],
  );
  const uploading = drafts.some((draft) => draft.uploading);
  const hasContent = text.trim() !== "" || ready.length > 0;
  const stopping = running && !hasContent && !uploading;
  const submitDisabled =
    !canSend || sending || uploading || (!stopping && !hasContent);
  const roomForImages = MAX_IMAGES_PER_MESSAGE - drafts.length;

  const upload = async (draft: Draft, image: PickedImage) => {
    try {
      const attachment = await onUploadImage(image);
      setDrafts((current) =>
        current.map((entry) =>
          entry.key === draft.key
            ? { ...entry, attachment, uploading: false }
            : entry,
        ),
      );
    } catch (error) {
      setFailure(uploadFailure(error));
      setDrafts((current) =>
        current.filter((entry) => entry.key !== draft.key),
      );
    }
  };

  const attach = async () => {
    setFailure(null);
    const picked = await onPickImages(roomForImages);
    const added = picked.map((image) => ({
      image,
      draft: {
        key: randomUUID(),
        uri: image.uri,
        name: image.name,
        uploading: true,
        attachment: null,
      },
    }));
    setDrafts((current) => [...current, ...added.map(({ draft }) => draft)]);
    await Promise.all(added.map(({ draft, image }) => upload(draft, image)));
  };

  const submit = async () => {
    if (stopping) {
      onStop();
      return;
    }
    if (submitDisabled) return;
    const sentText = text;
    const sentDrafts = drafts;
    setSending(true);
    setText("");
    setDrafts([]);
    const sent = await onSend(sentText.trim(), ready);
    setSending(false);
    if (sent) return;
    setText((current) => (current === "" ? sentText : current));
    setDrafts((current) => (current.length === 0 ? sentDrafts : current));
  };

  return (
    <View style={styles.wrap}>
      {failure ? (
        <Text
          accessibilityRole="alert"
          style={[styles.failure, { color: colors.destructive }]}
        >
          {failureMessages[failure]}
        </Text>
      ) : null}
      <View style={[styles.bar, floatingSurface]}>
        <AttachmentStrip
          drafts={drafts}
          onRemove={(key) =>
            setDrafts((current) => current.filter((entry) => entry.key !== key))
          }
        />
        <TextInput
          testID={inputTestID}
          value={text}
          onChangeText={setText}
          editable={canEdit}
          multiline
          autoFocus={autoFocus}
          placeholder={placeholder ?? t("composer.placeholder")}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground }]}
        />
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("composer.attach")}
            accessibilityState={{ disabled: !canSend || roomForImages <= 0 }}
            disabled={!canSend || roomForImages <= 0}
            onPress={() => void attach()}
            style={({ pressed }) => [
              styles.round,
              (pressed || !canSend || roomForImages <= 0) && styles.dimmed,
            ]}
          >
            <SymbolView
              name={{ ios: "paperclip", android: "attach_file" }}
              size={20}
              tintColor={colors.mutedForeground}
            />
          </Pressable>
          <View style={styles.spacer}>{accessory}</View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              stopping ? t("composer.stop") : t("composer.send")
            }
            accessibilityState={{ disabled: submitDisabled }}
            disabled={submitDisabled}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.round,
              { backgroundColor: colors.foreground },
              (pressed || submitDisabled) && styles.dimmed,
            ]}
          >
            <SymbolView
              name={
                stopping
                  ? { ios: "stop.fill", android: "stop" }
                  : { ios: "arrow.up", android: "arrow_upward" }
              }
              size={18}
              tintColor={colors.background}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const COMPOSER_RADIUS = 26;
const ROUND_SIZE = 36;

const styles = StyleSheet.create({
  wrap: { marginHorizontal: space.md, marginBottom: space.xs, gap: space.xs },
  failure: { fontSize: 13, paddingHorizontal: layout.sideMargin },
  bar: {
    gap: space.sm,
    paddingLeft: layout.sideMargin,
    paddingRight: space.sm,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderRadius: COMPOSER_RADIUS,
  },
  input: {
    minHeight: 26,
    maxHeight: 132,
    padding: 0,
    fontSize: 17,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: space.xs },
  spacer: { flex: 1, minWidth: 0 },
  round: {
    width: ROUND_SIZE,
    height: ROUND_SIZE,
    borderRadius: ROUND_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dimmed: { opacity: 0.4 },
});
