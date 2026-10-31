import { useRouter } from "expo-router";
import { requestCameraAccess } from "./camera-access";

export function usePairingRoutes() {
  const router = useRouter();
  return {
    openPaste: () => router.push("/pair"),
    openScan: async () => {
      await requestCameraAccess();
      router.push("/scan");
    },
    switchToScan: async () => {
      await requestCameraAccess();
      router.replace("/scan");
    },
  };
}
