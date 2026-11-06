import { spawnDaemon } from "@cocurdex/test-harness/helpers/daemon-process";
import { expect, it } from "vitest";
import { runCli } from "./helpers/cli";

it("manages application connections through the CLI without exposing credentials or changing custom MCP servers", async () => {
  const daemon = await spawnDaemon();
  const cli = (args: string[], input?: string) =>
    runCli(["apps", ...args], { userDataPath: daemon.userDataPath, input });
  try {
    const catalog = await cli(["catalog", "--json"]);
    expect(catalog.code).toBe(0);
    expect(
      JSON.parse(catalog.stdout).map((app: { id: string }) => app.id),
    ).toEqual(["notion", "linear", "github"]);
    const added = await cli([
      "add",
      "github",
      "--name",
      "Synthetic code",
      "--json",
    ]);
    expect(added.code).toBe(0);
    const connection = JSON.parse(added.stdout);
    expect(connection).toMatchObject({
      configured: false,
      status: null,
      personaIds: [],
      allowDelegatedWork: false,
    });
    const unsupported = await cli(["login", connection.id]);
    expect(unsupported.code).toBe(1);
    expect(unsupported.stderr).toContain("Configure");
    const update = {
      id: connection.id,
      revision: connection.revision,
      displayName: "Synthetic code",
      personaIds: [],
      allowDelegatedWork: false,
      enabled: true,
      clientId: "synthetic-client",
      clientSecret: "synthetic-secret",
      callbackPort: 19173,
    };
    const saved = await cli(
      ["update", "--stdin", "--json"],
      JSON.stringify(update),
    );
    expect(saved.code).toBe(0);
    expect(JSON.parse(saved.stdout).configured).toBe(true);
    expect(saved.stdout).not.toContain("synthetic-secret");
    const stale = await cli(["update", "--stdin"], JSON.stringify(update));
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain("Reload");
    const listed = await cli(["list", "--json"]);
    expect(JSON.parse(listed.stdout)).toHaveLength(1);
    expect(listed.stdout).not.toContain("synthetic-secret");
    expect((await cli(["remove", connection.id])).code).toBe(0);
    expect(JSON.parse((await cli(["list", "--json"])).stdout)).toEqual([]);
  } finally {
    await daemon.dispose();
  }
}, 60_000);
