export interface CodeLanguageOption {
  id: string;
  label: string;
  aliases: readonly string[];
}

export const CODE_LANGUAGE_OPTIONS: readonly CodeLanguageOption[] = [
  { id: "bash", label: "Bash", aliases: ["sh", "shell", "shellscript", "zsh"] },
  { id: "c", label: "C", aliases: ["h"] },
  { id: "cpp", label: "C++", aliases: ["c++", "cc", "hpp"] },
  { id: "csharp", label: "C#", aliases: ["c#", "cs"] },
  { id: "css", label: "CSS", aliases: [] },
  { id: "diff", label: "Diff", aliases: ["patch"] },
  { id: "dockerfile", label: "Dockerfile", aliases: ["docker"] },
  { id: "go", label: "Go", aliases: ["golang"] },
  { id: "graphql", label: "GraphQL", aliases: ["gql"] },
  { id: "html", label: "HTML", aliases: ["htm", "xhtml"] },
  { id: "java", label: "Java", aliases: [] },
  { id: "javascript", label: "JavaScript", aliases: ["js", "mjs", "cjs"] },
  { id: "json", label: "JSON", aliases: ["jsonc", "json5"] },
  { id: "jsx", label: "JSX", aliases: [] },
  { id: "kotlin", label: "Kotlin", aliases: ["kt", "kts"] },
  { id: "lua", label: "Lua", aliases: [] },
  { id: "makefile", label: "Makefile", aliases: ["make"] },
  { id: "markdown", label: "Markdown", aliases: ["md"] },
  { id: "objective-c", label: "Objective-C", aliases: ["objc"] },
  { id: "php", label: "PHP", aliases: [] },
  { id: "powershell", label: "PowerShell", aliases: ["ps", "ps1", "pwsh"] },
  { id: "python", label: "Python", aliases: ["py"] },
  { id: "r", label: "R", aliases: [] },
  { id: "ruby", label: "Ruby", aliases: ["rb"] },
  { id: "rust", label: "Rust", aliases: ["rs"] },
  { id: "scss", label: "SCSS", aliases: ["sass"] },
  { id: "sql", label: "SQL", aliases: [] },
  { id: "swift", label: "Swift", aliases: [] },
  { id: "toml", label: "TOML", aliases: [] },
  { id: "tsx", label: "TSX", aliases: [] },
  { id: "typescript", label: "TypeScript", aliases: ["ts", "mts", "cts"] },
  { id: "vue", label: "Vue", aliases: [] },
  { id: "xml", label: "XML", aliases: ["svg"] },
  { id: "yaml", label: "YAML", aliases: ["yml"] },
];

const OPTION_BY_NAME = new Map(
  CODE_LANGUAGE_OPTIONS.flatMap((option) =>
    [option.id, ...option.aliases].map((name) => [name, option] as const),
  ),
);

export function normalizeCodeLanguage(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function findCodeLanguageOption(raw: unknown) {
  return OPTION_BY_NAME.get(normalizeCodeLanguage(raw)) ?? null;
}

export function codeLanguageLabel(raw: unknown) {
  return findCodeLanguageOption(raw)?.label ?? normalizeCodeLanguage(raw);
}

export function highlightLanguage(raw: unknown) {
  return findCodeLanguageOption(raw)?.id ?? normalizeCodeLanguage(raw);
}
