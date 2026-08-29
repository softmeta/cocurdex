import { useAtomValue } from "jotai";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DropdownMenuCheckboxItem } from "@/components/ui";
import { providerModelsAtom } from "@/features/sessions";

interface WebSearchMenuItemProps {
  providerId: string | null;
  enabled: boolean;
  onChange(enabled: boolean): void;
}

// Provider-hosted web search is only available for OpenAI / Anthropic /
// Google. Other endpoints (custom OpenAI-compatible, local models) don't
// expose the tool — see packages/llm-chat/src/web-search.ts. We mirror the
// `supportsWebSearch` heuristic here so the renderer can disable the toggle
// without an extra IPC round-trip.
function providerSupportsWebSearch(providerName: string | null | undefined) {
  if (!providerName) return false;
  const lower = providerName.toLowerCase();
  return (
    lower.includes("openai") ||
    lower.includes("anthropic") ||
    lower.includes("google") ||
    lower.includes("gemini")
  );
}

// Web-search switch rendered as an item inside the composer's "+" attach
// dropdown. Selecting it toggles the provider-hosted web search without
// closing the menu, so the new check state stays visible.
export function WebSearchMenuItem({
  providerId,
  enabled,
  onChange,
}: WebSearchMenuItemProps) {
  const { t } = useTranslation("chat");
  const models = useAtomValue(providerModelsAtom);
  // We don't have direct access to ProviderConfigRecord here, so look up the
  // provider by the first model row we know belongs to it. Names are stable
  // enough for the heuristic check above.
  const sample = models.find((m) => m.providerId === providerId);
  const supported = providerSupportsWebSearch(sample?.providerId);
  const isOn = supported && enabled;

  return (
    <DropdownMenuCheckboxItem
      checked={isOn}
      // Base UI default is false; keep explicit so the toggle stays visible.
      closeOnClick={false}
      disabled={!supported}
      onCheckedChange={(checked) => {
        if (!supported) return;
        onChange(checked);
      }}
      title={
        supported
          ? t("webSearch.tooltip", {
              defaultValue: "Toggle web search for this conversation",
            })
          : t("webSearch.unsupported", {
              defaultValue: "Web search is not available for this provider",
            })
      }
    >
      <Globe className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {t("webSearch.label", { defaultValue: "Web search" })}
      </span>
    </DropdownMenuCheckboxItem>
  );
}
