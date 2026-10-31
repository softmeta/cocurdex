export function isJsonImportFile(file: Pick<File, "name" | "type">): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json") || name.endsWith(".txt")) {
    return true;
  }
  const type = file.type.toLowerCase();
  return type === "" || type === "application/json" || type.startsWith("text/");
}
