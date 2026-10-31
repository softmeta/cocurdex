import { useLocalSearchParams, useRouter } from "expo-router";
import { MermaidViewerScreen } from "@/markdown";

export default function DiagramRoute() {
  const router = useRouter();
  const { diagramId } = useLocalSearchParams<{ diagramId: string }>();
  return (
    <MermaidViewerScreen diagramId={diagramId} onClose={() => router.back()} />
  );
}
