import { useLocalSearchParams } from "expo-router";
import { ComputerDetailScreen } from "@/computers";

export default function ComputerRoute() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>();
  return <ComputerDetailScreen hostId={hostId} />;
}
