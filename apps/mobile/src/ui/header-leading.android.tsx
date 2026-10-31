import { Box } from "@expo/ui/jetpack-compose";
import { offset } from "@expo/ui/jetpack-compose/modifiers";
import type { ReactElement } from "react";

const ICON_BUTTON_INSET = 12;

export function headerLeading(item: ReactElement) {
  return <Box modifiers={[offset(-ICON_BUTTON_INSET, 0)]}>{item}</Box>;
}
