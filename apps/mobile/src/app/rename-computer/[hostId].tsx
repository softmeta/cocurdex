import { useLocalSearchParams } from "expo-router";
import { RenameComputerForm } from "@/computers";

export default function RenameComputerRoute() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>();
  return <RenameComputerForm hostId={hostId} />;
}
