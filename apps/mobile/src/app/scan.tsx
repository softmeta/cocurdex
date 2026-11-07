import { useRouter } from "expo-router";
import { ScanPairing } from "@/hosts";
import { enablePushNotifications } from "@/notifications";

export default function ScanScreen() {
  const router = useRouter();
  return (
    <ScanPairing
      onPaired={(hostId) => {
        enablePushNotifications();
        router.replace({ pathname: "/approve/[hostId]", params: { hostId } });
      }}
      onClose={() => router.back()}
      onPaste={() => router.replace("/pair")}
    />
  );
}
