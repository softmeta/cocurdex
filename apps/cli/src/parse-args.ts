export interface ParsedArgs {
  args: string[];
  flags: Map<string, string | boolean>;
}

export function parseArgs(args: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[index + 1];

      if (!nextArg || nextArg.startsWith("--")) {
        flags.set(key, true);
        continue;
      }

      flags.set(key, nextArg);
      index += 1;
      continue;
    }

    positional.push(arg);
  }

  return { args: positional, flags };
}

export function getRequiredFlag(parsed: ParsedArgs, name: string) {
  const value = parsed.flags.get(name);

  if (typeof value !== "string" || !value) {
    throw new Error(`Missing required --${name}`);
  }

  return value;
}

export function stringFlag(parsed: ParsedArgs, name: string) {
  const value = parsed.flags.get(name);
  return typeof value === "string" && value ? value : undefined;
}

export function printRows<T extends object>(
  rows: T[],
  columns: Array<keyof T & string>,
  parsed: ParsedArgs,
) {
  if (parsed.flags.has("json")) {
    printResult(rows, parsed);
    return;
  }

  if (rows.length === 0) {
    console.log("No records");
    return;
  }

  const widths = columns.map((column) =>
    Math.max(
      column.length,
      ...rows.map((row) => String(recordValue(row, column) ?? "").length),
    ),
  );
  console.log(
    columns.map((column, index) => column.padEnd(widths[index])).join("  "),
  );
  for (const row of rows) {
    console.log(
      columns
        .map((column, index) =>
          String(recordValue(row, column) ?? "").padEnd(widths[index]),
        )
        .join("  "),
    );
  }
}

export function printResult(value: unknown, parsed: ParsedArgs) {
  if (parsed.flags.has("json")) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (Array.isArray(value)) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, itemValue] of Object.entries(value)) {
      if (
        Array.isArray(itemValue) ||
        (itemValue && typeof itemValue === "object")
      ) {
        console.log(`${key}: ${JSON.stringify(itemValue)}`);
      } else {
        console.log(`${key}: ${String(itemValue)}`);
      }
    }
    return;
  }

  console.log(String(value));
}

function recordValue(row: object, key: string) {
  return (row as Record<string, unknown>)[key];
}
