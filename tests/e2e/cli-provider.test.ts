import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";
import { type DaemonProcess, spawnDaemon } from "./helpers/daemon-process";

describe("cocurdex provider CLI", () => {
  let daemon: DaemonProcess;
  let cli: (args: string[], input?: string) => ReturnType<typeof runCli>;

  beforeAll(async () => {
    daemon = await spawnDaemon();
    cli = (args, input) =>
      runCli(args, { userDataPath: daemon.userDataPath, input });
  });

  afterAll(async () => {
    await daemon.dispose();
  });

  it("configures a custom provider, its models, and the agent default", async () => {
    const added = await cli([
      "provider",
      "add",
      "acme",
      "--name",
      "Acme",
      "--base-url",
      "https://llm.acme.test/v1",
      "--json",
    ]);
    expect(added.code).toBe(0);
    expect(JSON.parse(added.stdout)).toMatchObject({
      id: "acme",
      name: "Acme",
      enabled: true,
    });

    const duplicate = await cli([
      "provider",
      "add",
      "acme",
      "--base-url",
      "https://other.test",
    ]);
    expect(duplicate.code).toBe(1);
    expect(duplicate.stderr).toContain("Provider already exists: acme");

    const model = await cli([
      "provider",
      "model",
      "add",
      "acme",
      "acme-large",
      "--api",
      "openai-completions",
    ]);
    expect(model.code).toBe(0);

    const models = await cli(["provider", "models", "acme", "--json"]);
    expect(JSON.parse(models.stdout)).toEqual([
      expect.objectContaining({ providerId: "acme", modelId: "acme-large" }),
    ]);

    const defaults = await cli([
      "provider",
      "default",
      "--agent",
      "pi",
      "--provider",
      "acme",
      "--model",
      "acme-large",
      "--json",
    ]);
    expect(defaults.code).toBe(0);
    expect(JSON.parse(defaults.stdout)).toEqual([
      expect.objectContaining({
        agentId: "pi",
        providerId: "acme",
        modelId: "acme-large",
      }),
    ]);

    const disabled = await cli([
      "provider",
      "update",
      "acme",
      "--disable",
      "--json",
    ]);
    expect(JSON.parse(disabled.stdout)).toMatchObject({ enabled: false });

    const removed = await cli(["provider", "remove", "acme"]);
    expect(removed.code).toBe(0);
    const listed = await cli(["provider", "list", "--json"]);
    expect(JSON.parse(listed.stdout)).toEqual([]);
  });

  it("logs in to a template provider through daemon-driven prompts", async () => {
    const providerId = "cloudflare-workers-ai";
    const added = await cli([
      "provider",
      "add",
      providerId,
      "--template",
      providerId,
    ]);
    expect(added.code).toBe(0);

    const login = await cli(
      ["provider", "login", providerId, "--method", "api_key"],
      "cf-test-key\naccount-123\n",
    );
    expect(login.stderr).toBe("");
    expect(login.code).toBe(0);
    expect(login.stdout).toContain("Enter Cloudflare API key");
    expect(login.stdout).toContain("Enter Cloudflare account ID");
    expect(login.stdout).toContain("Logged in to");

    const status = await cli(["provider", "status", providerId, "--json"]);
    expect(JSON.parse(status.stdout)).toMatchObject({
      providerId,
      type: "api_key",
    });

    const logout = await cli(["provider", "logout", providerId]);
    expect(logout.code).toBe(0);
    const afterLogout = await cli(["provider", "status", providerId, "--json"]);
    expect(JSON.parse(afterLogout.stdout)).toMatchObject({ type: null });
  });
});
