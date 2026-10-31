import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { SkillDetail } from "./skill-detail";
import {
  groupInstalledSkills,
  type SkillSelection,
  skillKey,
  skillRef,
} from "./skill-library-model";
import { SkillList } from "./skill-list";
import { SkillPackDetail } from "./skill-pack-detail";
import { SkillPackSkillDetail } from "./skill-pack-skill-detail";
import type { SkillLibraryState } from "./use-skill-library";
import { packDotState, type SkillPackState } from "./use-skill-pack";

export function SkillLibraryView({
  library,
  pack,
}: {
  library: SkillLibraryState;
  pack: SkillPackState;
}) {
  const { t } = useTranslation("settings");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<SkillSelection>({ kind: "pack" });
  const skills = library.library?.skills ?? [];
  const groups = groupInstalledSkills(skills, query);
  const selectedSkill =
    selection.kind === "skill"
      ? skills.find((skill) => skillKey(skillRef(skill)) === selection.key)
      : undefined;
  const packStatus = pack.statuses.global;
  const packSubtitle = t("skills.pack.subtitle", {
    count: packStatus?.packSkills.length ?? groups.builtin.length,
  });
  const changed = () => {
    void library.refresh();
  };
  const failures = library.lastCheck?.failures ?? [];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {library.loadError ? (
        <Text role="alert" size="meta" tone="destructive">
          {library.loadError}
        </Text>
      ) : null}
      {failures.map((failure) => (
        <Text key={failure.source} role="alert" size="meta" tone="destructive">
          {t("skills.list.checkFailed", {
            source: failure.source,
            error: failure.error,
          })}
        </Text>
      ))}
      <div className="flex min-h-0 min-w-0 flex-1 gap-6">
        <SkillList
          groups={groups}
          isChecking={library.isChecking}
          packDot={packDotState(pack.statuses)}
          packSubtitle={packSubtitle}
          query={query}
          selection={
            selectedSkill || selection.kind !== "skill" ? selection : null
          }
          workspaceName={library.library?.workspace?.name ?? null}
          onCheckUpdates={() => void library.checkUpdates()}
          onQueryChange={setQuery}
          onSelect={setSelection}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          <div className="flex min-w-0 flex-col pe-1">
            {selection.kind === "pack" ? (
              <SkillPackDetail
                builtin={groups.builtin}
                pack={pack}
                onChanged={changed}
                onOpenSkill={(name) =>
                  setSelection({ kind: "packSkill", name })
                }
              />
            ) : null}
            {selection.kind === "packSkill" ? (
              <SkillPackSkillDetail
                key={selection.name}
                name={selection.name}
                onBack={() => setSelection({ kind: "pack" })}
              />
            ) : null}
            {selectedSkill ? (
              <SkillDetail
                key={selection.kind === "skill" ? selection.key : "none"}
                skill={selectedSkill}
                onChanged={changed}
                onRemoved={() => {
                  setSelection({ kind: "pack" });
                  changed();
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
