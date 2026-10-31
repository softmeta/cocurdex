import { useTranslation } from "react-i18next";
import type { JsonImportMessages } from "../json-add-menu";
import type { JsonDropMessages } from "../json-drop-area";

export function useMcpJsonMessages(): JsonImportMessages & JsonDropMessages {
  const { t } = useTranslation("settings");
  return {
    invalidFile: t("mcp.jsonImport.invalidFile"),
    pasteTitle: t("mcp.jsonImport.pasteTitle"),
    pasteDescription: t("mcp.jsonImport.pasteDescription"),
    dropActive: t("mcp.jsonImport.dropActive"),
    dropHint: t("mcp.empty.dropHint"),
  };
}
