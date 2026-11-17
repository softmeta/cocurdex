import { AppFindBar } from "@/components/app/find-bar";
import { clearTerminalSearch, searchInTerminal } from "./terminal-registry";

interface TerminalSearchOverlayProps {
  terminalId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
}

export function TerminalSearchOverlay({
  terminalId,
  query,
  onQueryChange,
  onClose,
}: TerminalSearchOverlayProps) {
  return (
    <AppFindBar
      query={query}
      onQueryChange={onQueryChange}
      onNext={() => searchInTerminal(terminalId, query, "next")}
      onPrevious={() => searchInTerminal(terminalId, query, "previous")}
      onClose={() => {
        clearTerminalSearch(terminalId);
        onClose();
      }}
    />
  );
}
