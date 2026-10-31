import { NavigationBar } from "expo-navigation-bar";
import { useTranslation } from "react-i18next";
import {
  Image,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSavedHosts } from "@/hosts";
import { themeColors } from "@/theme";
import { CloseButton } from "@/ui";
import { imageAttachmentSource } from "./image-attachments";

const viewerColors = themeColors.dark;
const MAX_ZOOM = 4;

export function ImageViewerScreen({
  hostId,
  filePath,
  name,
  onClose,
}: {
  hostId: string;
  filePath: string;
  name: string;
  onClose(): void;
}) {
  const { t } = useTranslation("sessions");
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  const { width, height } = useWindowDimensions();
  return (
    <>
      <NavigationBar style="light" />
      <CloseButton
        accessibilityLabel={t("image.close")}
        onPress={onClose}
        scheme="dark"
      />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.center}
        maximumZoomScale={MAX_ZOOM}
        minimumZoomScale={1}
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {host ? (
          <Image
            accessibilityLabel={name}
            testID="image-viewer"
            resizeMode="contain"
            source={imageAttachmentSource(host, { filePath })}
            style={{ width, height }}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: viewerColors.background },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
});
