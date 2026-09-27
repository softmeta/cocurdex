import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import type { ProviderAuthPrompt } from "@cocurdex/shared";
import {
  type ProviderLoginUi,
  resolveSelectAnswer,
} from "./run-provider-login";

function browserCommand(url: string): [string, string[]] {
  if (process.platform === "darwin") return ["open", [url]];
  if (process.platform === "win32") {
    return ["rundll32", ["url.dll,FileProtocolHandler", url]];
  }
  return ["xdg-open", [url]];
}

function openBrowser(url: string) {
  const [command, args] = browserCommand(url);
  spawn(command, args, { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}

function formatSelectPrompt(
  prompt: Extract<ProviderAuthPrompt, { type: "select" }>,
) {
  const options = prompt.options.map((option, index) => {
    const description = option.description ? ` - ${option.description}` : "";
    return `  ${index + 1}. ${option.label}${description}`;
  });
  return [prompt.message, ...options, "Choose a number: "].join("\n");
}

export function createTextLoginUi() {
  const controller = new AbortController();
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
  const prompts = new Map<string, AbortController>();
  readline.on("SIGINT", () => controller.abort());

  async function readPipedLine(
    lines: AsyncIterator<string>,
    signal: AbortSignal,
  ) {
    const dismissed = new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new Error("Prompt dismissed")),
        { once: true },
      );
    });
    const result = await Promise.race([lines.next(), dismissed]);
    if (result.done) throw new Error("Input ended before login finished");
    return result.value;
  }

  async function ask(promptId: string, query: string, secret: boolean) {
    const promptController = new AbortController();
    prompts.set(promptId, promptController);
    const signal = AbortSignal.any([
      controller.signal,
      promptController.signal,
    ]);
    try {
      if (pipedLines) {
        process.stdout.write(`${query}\n`);
        return await readPipedLine(pipedLines, signal);
      }
      if (!secret) return await readline.question(query, { signal });
      process.stdout.write(query);
      muted = true;
      const value = await readline.question("", { signal });
      process.stdout.write("\n");
      return value;
    } finally {
      muted = false;
      prompts.delete(promptId);
    }
  }

  const ui: ProviderLoginUi & { close(): void } = {
    signal: controller.signal,
    showAuthUrl(url, instructions) {
      console.log(`Open this URL to continue:\n  ${url}`);
      if (instructions) console.log(instructions);
      if (interactive) openBrowser(url);
    },
    showDeviceCode(userCode, verificationUri) {
      console.log(`Open ${verificationUri} and enter code: ${userCode}`);
      if (interactive) openBrowser(verificationUri);
    },
    showMessage(message) {
      console.log(message);
    },
    async prompt(prompt) {
      if (prompt.type === "select") {
        const answer = await ask(prompt.id, formatSelectPrompt(prompt), false);
        return resolveSelectAnswer(prompt, answer.trim());
      }
      const hint = prompt.placeholder ? ` (e.g. ${prompt.placeholder})` : "";
      const answer = await ask(
        prompt.id,
        `${prompt.message}${hint}: `,
        prompt.type === "secret",
      );
      return answer.trim();
    },
    dismissPrompt(promptId) {
      prompts.get(promptId)?.abort();
    },
    close() {
      readline.close();
    },
  };
  return ui;
}
