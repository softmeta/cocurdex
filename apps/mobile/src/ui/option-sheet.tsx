import { useRouter } from "expo-router";
import { useOptionSheetRoute } from "./option-sheet-route";
import {
  type OptionSheetRequest,
  optionSheetOrigin,
  presentOptionSheet,
} from "./option-sheet-store";

export type OpenOptionSheet = (request: OptionSheetRequest) => void;

export function useOptionSheet(): OpenOptionSheet {
  const router = useRouter();
  const route = useOptionSheetRoute();
  return (request) => {
    const origin = optionSheetOrigin(route);
    const depth = origin.depth + 1;
    const id = presentOptionSheet(request, depth);
    router.push({
      pathname: origin.pathname,
      params: { ...origin.params, id, depth: String(depth) },
    } as never);
  };
}
