import { useLocalSearchParams, useRouter } from "expo-router";
import { ImageViewerScreen } from "@/session-detail";

export default function ImageRoute() {
  const router = useRouter();
  const { hostId, filePath, name } = useLocalSearchParams<{
    hostId: string;
    filePath: string;
    name: string;
  }>();
  return (
    <ImageViewerScreen
      hostId={hostId}
      filePath={filePath}
      name={name ?? ""}
      onClose={() => router.back()}
    />
  );
}
