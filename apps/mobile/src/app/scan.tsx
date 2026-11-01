import { useRouter } from "expo-router";
import { ScanPairing } from "@/hosts";
import { enablePushNotifications } from "@/notifications";

export default function ScanScreen() {
  const router = useRouter();
  return (
    <ScanPairing
      onPaired={() => {
        enablePushNotifications();
        router.back();
      }}
      onClose={() => router.back()}
      onPaste={() => router.replace("/pair")}
    />
  );
}
