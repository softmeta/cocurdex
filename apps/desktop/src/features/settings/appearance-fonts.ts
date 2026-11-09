export interface AppearanceFontOption {
  id: string;
  label: string;
  value: string;
}

export function toCssFontFamilyValue(familyName: string): string {
  const trimmed = familyName.trim();
  if (!trimmed) {
    return "";
  }
  return `"${trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export const fallbackUiFontOptions: AppearanceFontOption[] = [
  { id: "system", label: "System", value: "" },
  {
    id: "sf-pro",
    label: "SF Pro Text",
    value: '"SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    id: "inter",
    label: "Inter",
    value: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: "helvetica",
    label: "Helvetica Neue",
    value: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    id: "segoe",
    label: "Segoe UI",
    value: '"Segoe UI", system-ui, sans-serif',
  },
  {
    id: "arial",
    label: "Arial",
    value: "Arial, Helvetica, sans-serif",
  },
  {
    id: "georgia",
    label: "Georgia",
    value: "Georgia, Times, serif",
  },
  {
    id: "pingfang",
    label: "PingFang SC",
    value:
      '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
  },
];

export const fallbackCodeFontOptions: AppearanceFontOption[] = [
  { id: "system", label: "System", value: "" },
  {
    id: "sf-mono",
    label: "SF Mono",
    value: '"SF Mono", SFMono-Regular, ui-monospace, Menlo, monospace',
  },
  {
    id: "menlo",
    label: "Menlo",
    value: "Menlo, Monaco, Consolas, monospace",
  },
  {
    id: "monaco",
    label: "Monaco",
    value: "Monaco, Menlo, Consolas, monospace",
  },
  {
    id: "consolas",
    label: "Consolas",
    value: "Consolas, 'Courier New', monospace",
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    value: '"JetBrains Mono", ui-monospace, Menlo, monospace',
  },
  {
    id: "fira",
    label: "Fira Code",
    value: '"Fira Code", ui-monospace, Menlo, monospace',
  },
  {
    id: "cascadia",
    label: "Cascadia Code",
    value: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
  },
  {
    id: "source-code",
    label: "Source Code Pro",
    value: '"Source Code Pro", ui-monospace, Menlo, monospace',
  },
  {
    id: "ibm-plex",
    label: "IBM Plex Mono",
    value: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  },
  {
    id: "courier",
    label: "Courier New",
    value: '"Courier New", Courier, monospace',
  },
];

export const uiFontOptions = fallbackUiFontOptions;
export const codeFontOptions = fallbackCodeFontOptions;

export function buildSystemFontOptions(
  families: string[],
  systemLabel: string,
  currentValue: string,
): AppearanceFontOption[] {
  const options: AppearanceFontOption[] = [
    { id: "system", label: systemLabel, value: "" },
  ];

  const seenValues = new Set<string>([""]);
  for (const family of families) {
    const value = toCssFontFamilyValue(family);
    if (!value || seenValues.has(value)) {
      continue;
    }
    seenValues.add(value);
    options.push({
      id: `family:${family}`,
      label: family,
      value,
    });
  }

  if (currentValue && !seenValues.has(currentValue)) {
    options.push({
      id: `custom:${currentValue}`,
      label: currentValue,
      value: currentValue,
    });
  }

  return options;
}

export function fontOptionsForValue(
  fallbackOptions: AppearanceFontOption[],
  value: string,
  systemLabel: string,
  systemFamilies?: string[] | null,
): AppearanceFontOption[] {
  if (systemFamilies && systemFamilies.length > 0) {
    return buildSystemFontOptions(systemFamilies, systemLabel, value);
  }

  const mapped = fallbackOptions.map((option) =>
    option.id === "system" ? { ...option, label: systemLabel } : option,
  );
  if (value === "" || mapped.some((option) => option.value === value)) {
    return mapped;
  }
  return [
    ...mapped,
    {
      id: `custom:${value}`,
      label: value,
      value,
    },
  ];
}
