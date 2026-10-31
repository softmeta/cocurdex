import { Camera } from "expo-camera";

export async function requestCameraAccess() {
  const current = await Camera.getCameraPermissionsAsync();
  if (current.granted || !current.canAskAgain) return current.granted;
  return (await Camera.requestCameraPermissionsAsync()).granted;
}
