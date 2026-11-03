import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export interface CredentialReader {
  read(label: string): Promise<string>;
  close(): void;
}

export interface CredentialReaderOptions {
  input: NodeJS.ReadableStream;
  prompts: NodeJS.WritableStream;
  interactive: boolean;
}

function stripLineEnding(value: string) {
  return value.replace(/\r$/, "");
}

function defaultOptions(): CredentialReaderOptions {
  return {
    input: process.stdin,
    prompts: process.stderr,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  };
}

export function createCredentialReader(
  overrides: Partial<CredentialReaderOptions> = {},
): CredentialReader {
  const options = { ...defaultOptions(), ...overrides };
  let muted = false;
  const echo = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) options.prompts.write(chunk, encoding);
      callback();
    },
  });
  const readline = createInterface({
    input: options.input,
    output: echo,
    terminal: options.interactive,
  });
  const pipedLines = options.interactive
    ? null
    : readline[Symbol.asyncIterator]();

  async function read(label: string) {
    if (pipedLines) {
      options.prompts.write(`${label}\n`);
      const next = await pipedLines.next();
      if (next.done) {
        throw new Error(`${label.trim().replace(/:$/, "")} was not provided`);
      }
      return stripLineEnding(next.value);
    }
    options.prompts.write(label);
    muted = true;
    try {
      return stripLineEnding(await readline.question(""));
    } finally {
      muted = false;
      options.prompts.write("\n");
    }
  }

  return {
    read,
    close() {
      readline.close();
    },
  };
}
