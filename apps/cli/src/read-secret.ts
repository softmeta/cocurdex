import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export interface CredentialReader {
  read(label: string): Promise<string>;
  close(): void;
}

export function createCredentialReader(): CredentialReader {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const readline = createInterface({
    input: process.stdin,
    output,
    terminal: interactive,
  });
  const pipedLines = interactive ? null : readline[Symbol.asyncIterator]();

  async function read(label: string) {
    if (pipedLines) {
      process.stdout.write(`${label}\n`);
      const next = await pipedLines.next();
      if (next.done) {
        throw new Error(`${label.trim().replace(/:$/, "")} was not provided`);
      }
      return next.value.trim();
    }
    process.stdout.write(label);
    muted = true;
    try {
      return (await readline.question("")).trim();
    } finally {
      muted = false;
      process.stdout.write("\n");
    }
  }

  return {
    read,
    close() {
      readline.close();
    },
  };
}
