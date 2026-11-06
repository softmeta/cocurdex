import { requestDaemon } from "@cocurdex/daemon/client";
import { APPLICATION_CATALOG } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import { assertKnownFlags, getRequiredFlag, parseArgs } from "./parse-args";
import { readStdin } from "./read-stdin";

export function applicationUsageLines() {
  return [
    "  cocurdex apps catalog|list [--json]",
    "  cocurdex apps add <notion|linear|github> --name <name> [--assistants <id,id>] [--delegated] [--json]",
    "  cocurdex apps update --stdin [--json]",
    "  cocurdex apps check|tools|logout|remove <connection-id> [--json]",
    "  cocurdex apps login <connection-id> [--json]",
    "  cocurdex apps login-wait|login-cancel <connection-id> --login <id> [--json]",
    "  cocurdex apps login-return <connection-id> --login <id> --stdin [--json]",
    "  cocurdex apps read|call <connection-id> --tool <name> --stdin [--json]",
  ];
}

export async function handleApplicationCommand(raw: string[]) {
  const [action, ...rest] = raw;
  const parsed = parseArgs(rest);
  assertKnownFlags(
    parsed,
    ["name", "assistants", "delegated", "stdin", "login", "tool"],
    "apps",
  );
  const id = parsed.args[0];
  const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
  const requireId = () => {
    if (!id || parsed.args.length !== 1)
      throw new Error("Provide exactly one application connection ID");
    return id;
  };
  switch (action) {
    case "catalog":
      print(APPLICATION_CATALOG);
      return true;
    case "list":
      print(await withDaemon(() => requestDaemon("application.list")));
      return true;
    case "add": {
      const app = APPLICATION_CATALOG.find((item) => item.id === id);
      if (!app) throw new Error("Choose notion, linear, or github");
      const name = getRequiredFlag(parsed, "name");
      const ids = parsed.flags.get("assistants");
      print(
        await withDaemon(() =>
          requestDaemon("application.add", {
            applicationId: app.id,
            displayName: name,
            personaIds:
              typeof ids === "string" ? ids.split(",").filter(Boolean) : [],
            allowDelegatedWork: parsed.flags.get("delegated") === true,
          }),
        ),
      );
      return true;
    }
    case "update": {
      if (!parsed.flags.has("stdin"))
        throw new Error(
          "Pass the update JSON through --stdin; never put credentials in command arguments",
        );
      const payload = JSON.parse(await readStdin());
      print(
        await withDaemon(() => requestDaemon("application.update", payload)),
      );
      return true;
    }
    case "check":
      print(
        await withDaemon(() =>
          requestDaemon("application.check", { id: requireId() }),
        ),
      );
      return true;
    case "tools":
      print(
        await withDaemon(() =>
          requestDaemon("application.tools", { id: requireId() }),
        ),
      );
      return true;
    case "logout":
      print(
        await withDaemon(() =>
          requestDaemon("application.logout", { id: requireId() }),
        ),
      );
      return true;
    case "remove":
      await withDaemon(() =>
        requestDaemon("application.remove", { id: requireId() }),
      );
      print({ removed: true });
      return true;
    case "login":
      print(
        await withDaemon(() =>
          requestDaemon("application.login.start", { id: requireId() }),
        ),
      );
      return true;
    case "login-wait":
      print(
        await withDaemon(() =>
          requestDaemon("application.login.wait", {
            id: requireId(),
            loginId: getRequiredFlag(parsed, "login"),
          }),
        ),
      );
      return true;
    case "login-cancel":
      await withDaemon(() =>
        requestDaemon("application.login.cancel", {
          id: requireId(),
          loginId: getRequiredFlag(parsed, "login"),
        }),
      );
      return true;
    case "login-return": {
      if (!parsed.flags.has("stdin"))
        throw new Error("Pass the complete return URL through --stdin");
      const url = (await readStdin()).trim();
      await withDaemon(() =>
        requestDaemon("application.login.return", {
          id: requireId(),
          loginId: getRequiredFlag(parsed, "login"),
          url,
        }),
      );
      print({ submitted: true });
      return true;
    }
    case "read":
    case "call": {
      if (!parsed.flags.has("stdin"))
        throw new Error("Pass tool arguments as JSON through --stdin");
      const args = JSON.parse(await readStdin());
      print(
        await withDaemon(() =>
          requestDaemon(
            action === "read" ? "application.read" : "application.call",
            {
              id: requireId(),
              tool: getRequiredFlag(parsed, "tool"),
              args,
            },
          ),
        ),
      );
      return true;
    }
    default:
      return false;
  }
}
