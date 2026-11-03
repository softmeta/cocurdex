import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export interface CredentialReader {
  read(label: string): Promise<string>;
  close(): void;
}

export interface TerminalInputStream extends NodeJS.ReadableStream {
  isTTY?: boolean;
}

export interface CredentialReaderOptions {
  input: TerminalInputStream;
  prompts: NodeJS.WritableStream;
  interactive: boolean;
}

function stripLineEnding(value: string) {
  return value.replace(/\r$/, "");
}

export function createCredentialReader(
  overrides: Partial<CredentialReaderOptions> = {},
): CredentialReader {
  const input = overrides.input ?? process.stdin;
  const prompts = overrides.prompts ?? process.stderr;
  const interactive = overrides.interactive ?? Boolean(input.isTTY);
  let muted = false;
  const echo = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) prompts.write(chunk, encoding);
      callback();
    },
  });
  const readline = createInterface({
    input,
    output: echo,
    terminal: interactive,
  });
  const pipedLines = interactive ? null : readline[Symbol.asyncIterator]();

  async function read(label: string) {
    if (pipedLines) {
      prompts.write(`${label}\n`);
      const next = await pipedLines.next();
      if (next.done) {
        throw new Error(`${label.trim().replace(/:$/, "")} was not provided`);
      }
      return stripLineEnding(next.value);
    }
    prompts.write(label);
    muted = true;
    try {
      return stripLineEnding(await readline.question(""));
    } finally {
      muted = false;
      prompts.write("\n");
    }
  }

  return {
    read,
    close() {
      readline.close();
    },
  };
}
