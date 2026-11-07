import { useLocalSearchParams } from "expo-router";
import { PairingApprovalScreen } from "@/computers";

export default function PairingApprovalRoute() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>();
  return <PairingApprovalScreen hostId={hostId} />;
}
