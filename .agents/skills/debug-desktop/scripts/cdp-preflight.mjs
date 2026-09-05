import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  connect,
  evaluate,
  readEndpoint,
  selectTarget,
} from "./cdp-client.mjs";

function inspectProcesses() {
  const root = fileURLToPath(new URL("../../../../", import.meta.url)).replace(
    /[\\/]$/,
    "",
  );
  try {
    let processes;
    if (process.platform === "win32") {
      const output = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
        ],
        { encoding: "utf8", timeout: 5000, maxBuffer: 8 * 1024 * 1024 },
      );
      processes = [JSON.parse(output)].flat().map((item) => ({
        pid: item.ProcessId,
        parentPid: item.ParentProcessId,
        command: item.CommandLine ?? "",
      }));
    } else {
      const output = execFileSync("ps", ["-axo", "pid=,ppid=,command="], {
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 8 * 1024 * 1024,
      });
      processes = output.split("\n").flatMap((line) => {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
        return match
          ? [
              {
                pid: Number(match[1]),
                parentPid: Number(match[2]),
                command: match[3],
              },
            ]
          : [];
      });
    }
    return {
      candidates: processes
        .filter(
          (item) =>
            item.command.includes(root) &&
            /electron-vite.*\bdev\b/.test(item.command),
        )
        .map((item) => ({
          ...item,
          watchArgument: /(?:^|\s)(?:--watch|-w)(?:\s|$)/.test(item.command),
        })),
      watchConfiguration:
        "Not evaluated. CLI arguments alone do not establish config-based watch mode or associate a process with the selected CDP port.",
    };
  } catch (error) {
    return { candidates: [], error: error.message };
  }
}

export async function preflight(base, options) {
  const report = { endpoint: base, development: inspectProcesses() };
  let client;
  try {
    report.browser = await readEndpoint(base, "/json/version", options.timeout);
    const targets = await readEndpoint(base, "/json/list", options.timeout);
    report.targets = targets.map(({ id, type, title, url }) => ({
      id,
      type,
      title,
      url,
    }));
    const target = selectTarget(targets, options);
    report.selectedTarget = target.id;
    client = await connect(target, options.timeout);
    report.renderer = await evaluate(
      client,
      `(async () => {
      const api = window.desktopApi;
      const methods = ${JSON.stringify(options.api)};
      const available = Object.fromEntries(methods.map(name => [name, typeof api?.[name] === 'function']));
      let daemon = null;
      let daemonError = null;
      if (typeof api?.getDaemonStatus === 'function') {
        try { daemon = await api.getDaemonStatus(); }
        catch (error) { daemonError = String(error); }
      } else { daemonError = 'getDaemonStatus is unavailable'; }
      return { title: document.title, url: location.href, readyState: document.readyState,
        hasDesktopApi: Boolean(api), methods: available, daemon, daemonError };
    })()`,
      options.timeout,
    );
    const renderer = report.renderer;
    report.apiAndDaemonReady =
      renderer.hasDesktopApi &&
      Object.values(renderer.methods).every(Boolean) &&
      renderer.daemon?.running === true &&
      renderer.daemon?.matchesRuntime === true &&
      !renderer.daemonError &&
      !renderer.daemon?.error;
    report.limitation =
      "API presence and daemon fingerprint do not prove renderer or main/preload source freshness. Verify the changed behavior.";
  } catch (error) {
    report.error = error.message;
    report.apiAndDaemonReady = false;
  } finally {
    client?.close();
  }
  return report;
}
