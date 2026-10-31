import { useRouter } from "expo-router";
import { ScanPairing } from "@/hosts";

export default function ScanScreen() {
  const router = useRouter();
  return (
    <ScanPairing
      onPaired={() => router.back()}
      onClose={() => router.back()}
      onPaste={() => router.replace("/pair")}
    />
  );
}
