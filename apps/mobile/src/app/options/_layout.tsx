import { Stack } from "expo-router";
import { SheetSurface } from "@/theme";
import { useSheetStackOptions } from "@/ui";

function OptionsStack() {
  const screenOptions = useSheetStackOptions();
  return <Stack screenOptions={screenOptions} />;
}

export default function OptionsLayout() {
  return (
    <SheetSurface>
      <OptionsStack />
    </SheetSurface>
  );
}
