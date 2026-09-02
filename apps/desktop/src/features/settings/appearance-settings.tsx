import { Minus, Monitor, Moon, Plus, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui";
import { useResolvedTheme } from "@/lib";
import {
  type AppearanceFontOption,
  fallbackCodeFontOptions,
  fallbackUiFontOptions,
  fontOptionsForValue,
} from "./appearance-fonts";
import { SettingsSearchableSelect } from "./settings-select";
import {
  type AppearanceSettings,
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  getThemePresetMeta,
  isThemePresetId,
  listThemePresets,
  type ThemeMode,
  type ThemePresetId,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
} from "./theme";
import { useSystemFontFamilies } from "./use-system-font-families";

interface AppearancePanelProps {
  appearanceSettings: AppearanceSettings;
  onAppearanceSettingsChange(settings: AppearanceSettings): void;
  onThemeModeChange(themeMode: ThemeMode): void;
  themeMode: ThemeMode;
}

interface SettingRowProps {
  children?: ReactNode;
  description?: string;
  title: string;
}

function SettingsGroup({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="flex flex-col">
      {title ? (
        <div className="mb-2 px-1 text-meta font-medium text-muted-foreground/60">
          {title}
        </div>
      ) : null}
      <div className="rounded-card border border-border/40 bg-card/45 px-4">
        <div className="flex flex-col divide-y divide-border/30">
          {children}
        </div>
      </div>
    </div>
  );
}

function SettingRow({ children, description, title }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-foreground">{title}</div>
        {description ? (
          <div className="mt-0.5 text-body text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Stepper({
  max,
  min,
  onChange,
  value,
}: {
  max: number;
  min: number;
  onChange(value: number): void;
  value: number;
}) {
  const { t } = useTranslation("common");
  const updateValue = (nextValue: number) => {
    onChange(Math.min(max, Math.max(min, nextValue)));
  };

  return (
    <div className="flex h-8 items-center overflow-hidden rounded-control border border-border bg-background/60 text-body text-foreground">
      <button
        aria-label={t("actions.decrease")}
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => updateValue(value - 1)}
        type="button"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-10 text-center tabular-nums">{value}</span>
      <button
        aria-label={t("actions.increase")}
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => updateValue(value + 1)}
        type="button"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function FontFamilySelect({
  ariaLabel,
  fallbackOptions,
  onChange,
  systemFamilies,
  systemLabel,
  value,
}: {
  ariaLabel: string;
  fallbackOptions: AppearanceFontOption[];
  onChange(value: string): void;
  /** null while loading; empty/full list once settled. */
  systemFamilies: string[] | null;
  systemLabel: string;
  value: string;
}) {
  const { t } = useTranslation("settings");
  const items = fontOptionsForValue(
    fallbackOptions,
    value,
    systemLabel,
    systemFamilies,
  );
  const selected =
    items.find((option) => option.value === value) ??
    items[0] ??
    ({
      id: "system",
      label: systemLabel,
      value: "",
    } satisfies AppearanceFontOption);

  return (
    <SettingsSearchableSelect
      ariaLabel={ariaLabel}
      emptyText={t("appearance.typography.fontEmpty")}
      options={items.map((option) => ({
        value: option.value,
        label: option.label,
        keywords: option.id,
        labelStyle: option.value ? { fontFamily: option.value } : undefined,
      }))}
      searchPlaceholder={t("appearance.typography.fontSearchPlaceholder")}
      triggerLabel={
        <span
          className="min-w-0 truncate"
          style={selected.value ? { fontFamily: selected.value } : undefined}
        >
          {selected.label}
        </span>
      }
      value={value}
      onChange={onChange}
    />
  );
}

function ThemePresetSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-3.5 shrink-0 rounded-full border border-border/50"
      style={{ backgroundColor: color }}
    />
  );
}

function ThemePresetSelect({
  onChange,
  value,
}: {
  onChange(value: ThemePresetId): void;
  value: ThemePresetId;
}) {
  const { t } = useTranslation("settings");
  // Swatch follows the resolved surface (light/dark), not the mode toggle alone,
  // so "System" still previews the palette the user is currently seeing.
  const resolvedTheme = useResolvedTheme();
  const resolved: "light" | "dark" =
    resolvedTheme === "light" ? "light" : "dark";
  const presets = listThemePresets();
  const selected = getThemePresetMeta(value);

  return (
    <SettingsSearchableSelect
      ariaLabel={t("appearance.preset.title")}
      emptyText={t("appearance.preset.empty")}
      options={presets.map((preset) => ({
        value: preset.id,
        label: preset.label,
        keywords: preset.id,
        icon: <ThemePresetSwatch color={preset.swatch[resolved]} />,
      }))}
      searchPlaceholder={t("appearance.preset.searchPlaceholder")}
      triggerLabel={
        <span className="flex min-w-0 items-center gap-2">
          <ThemePresetSwatch color={selected.swatch[resolved]} />
          <span className="truncate">{selected.label}</span>
        </span>
      }
      value={value}
      onChange={(next) => onChange(next as ThemePresetId)}
    />
  );
}

export function AppearancePanel({
  appearanceSettings,
  onAppearanceSettingsChange,
  onThemeModeChange,
  themeMode,
}: AppearancePanelProps) {
  const { t } = useTranslation("settings");
  const systemFontFamilies = useSystemFontFamilies();
  const updateAppearanceSettings = (
    nextSettings: Partial<AppearanceSettings>,
  ) => {
    onAppearanceSettingsChange({
      ...appearanceSettings,
      ...nextSettings,
    });
  };

  return (
    <div className="settings-panel-enter flex flex-col gap-8">
      <SettingsGroup>
        <SettingRow
          description={t("appearance.theme.description")}
          title={t("appearance.theme.title")}
        >
          <ToggleGroup
            spacing={0.5}
            type="single"
            value={themeMode}
            variant="segmented"
            onValueChange={(value) => {
              if (value === "light" || value === "dark" || value === "system") {
                onThemeModeChange(value);
              }
            }}
          >
            <ToggleGroupItem
              aria-label={t("appearance.modes.light")}
              value="light"
            >
              <Sun className="me-1.5 size-3.5" />
              {t("appearance.modes.light")}
            </ToggleGroupItem>
            <ToggleGroupItem
              aria-label={t("appearance.modes.dark")}
              value="dark"
            >
              <Moon className="me-1.5 size-3.5" />
              {t("appearance.modes.dark")}
            </ToggleGroupItem>
            <ToggleGroupItem
              aria-label={t("appearance.modes.system")}
              value="system"
            >
              <Monitor className="me-1.5 size-3.5" />
              {t("appearance.modes.system")}
            </ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>
        <SettingRow
          description={t("appearance.preset.description")}
          title={t("appearance.preset.title")}
        >
          <ThemePresetSelect
            onChange={(themePreset) => {
              if (isThemePresetId(themePreset)) {
                updateAppearanceSettings({ themePreset });
              }
            }}
            value={appearanceSettings.themePreset}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("appearance.typography.groupTitle")}>
        <SettingRow
          description={t("appearance.typography.uiFontSize.description")}
          title={t("appearance.typography.uiFontSize.title")}
        >
          <Stepper
            max={UI_FONT_SIZE_MAX}
            min={UI_FONT_SIZE_MIN}
            onChange={(uiFontSize) => updateAppearanceSettings({ uiFontSize })}
            value={appearanceSettings.uiFontSize}
          />
        </SettingRow>
        <SettingRow
          description={t("appearance.typography.codeFontSize.description")}
          title={t("appearance.typography.codeFontSize.title")}
        >
          <Stepper
            max={CODE_FONT_SIZE_MAX}
            min={CODE_FONT_SIZE_MIN}
            onChange={(codeFontSize) =>
              updateAppearanceSettings({ codeFontSize })
            }
            value={appearanceSettings.codeFontSize}
          />
        </SettingRow>
        <SettingRow
          description={t("appearance.typography.uiFontFamily.description")}
          title={t("appearance.typography.uiFontFamily.title")}
        >
          <FontFamilySelect
            ariaLabel={t("appearance.typography.uiFontFamily.title")}
            fallbackOptions={fallbackUiFontOptions}
            onChange={(uiFontFamily) =>
              updateAppearanceSettings({ uiFontFamily })
            }
            systemFamilies={systemFontFamilies}
            systemLabel={t("appearance.typography.uiFontFamily.system")}
            value={appearanceSettings.uiFontFamily}
          />
        </SettingRow>
        <SettingRow
          description={t("appearance.typography.codeFontFamily.description")}
          title={t("appearance.typography.codeFontFamily.title")}
        >
          <FontFamilySelect
            ariaLabel={t("appearance.typography.codeFontFamily.title")}
            fallbackOptions={fallbackCodeFontOptions}
            onChange={(codeFontFamily) =>
              updateAppearanceSettings({ codeFontFamily })
            }
            systemFamilies={systemFontFamilies}
            systemLabel={t("appearance.typography.codeFontFamily.system")}
            value={appearanceSettings.codeFontFamily}
          />
        </SettingRow>
        <CodePreview settings={appearanceSettings} />
      </SettingsGroup>
    </div>
  );
}

function CodePreview({ settings }: { settings: AppearanceSettings }) {
  const fontFamily = settings.codeFontFamily || "var(--font-mono)";

  return (
    <div
      className="my-3 overflow-hidden rounded-control border border-border bg-background/70"
      style={{
        fontFamily,
        fontSize: "var(--app-code-font-size)",
      }}
    >
      <div className="bg-[color-mix(in_srgb,var(--editor-git-deleted)_12%,transparent)] px-4 py-1.5 text-editor-git-deleted">
        <span className="me-5">1</span>
        <code>return a + b;</code>
      </div>
      <div className="bg-[color-mix(in_srgb,var(--editor-git-added)_12%,transparent)] px-4 py-1.5 text-editor-git-added">
        <span className="me-5">1</span>
        <code>const result = a + b;</code>
      </div>
      <div className="bg-[color-mix(in_srgb,var(--editor-git-added)_12%,transparent)] px-4 py-1.5 text-editor-git-added">
        <span className="me-5">2</span>
        <code>return result;</code>
      </div>
    </div>
  );
}
