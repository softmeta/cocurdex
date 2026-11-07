import { spawnDaemon } from "@cocurdex/test-harness/helpers/daemon-process";
import { expect, it } from "vitest";
import { runCli } from "./helpers/cli";

it("manages application connections through the CLI", async () => {
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
      status: null,
      personaIds: [],
      allowDelegatedWork: false,
    });
    const update = {
      id: connection.id,
      revision: connection.revision,
      displayName: "Synthetic repositories",
      personaIds: [],
      allowDelegatedWork: false,
      enabled: true,
    };
    const saved = await cli(
      ["update", "--stdin", "--json"],
      JSON.stringify(update),
    );
    expect(saved.code).toBe(0);
    expect(JSON.parse(saved.stdout).displayName).toBe("Synthetic repositories");
    const stale = await cli(["update", "--stdin"], JSON.stringify(update));
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain("Reload");
    const listed = await cli(["list", "--json"]);
    expect(JSON.parse(listed.stdout)).toHaveLength(1);
    expect((await cli(["remove", connection.id])).code).toBe(0);
    expect(JSON.parse((await cli(["list", "--json"])).stdout)).toEqual([]);
  } finally {
    await daemon.dispose();
  }
}, 60_000);
