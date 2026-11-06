import { createServer } from "node:http";
import {
  createPiApplicationClient,
  startPiMcpSignIn,
} from "@cocurdex/agent-adapters/pi-mcp";
import { DaemonMcpService } from "@cocurdex/daemon/internal/mcp-service";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const dirs = createTempDirs();
afterAll(() => dirs.cleanup());

async function setup() {
  let baseUrl = "";
  let exchanges = 0;
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    const url = new URL(request.url ?? "/", baseUrl);
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      response.end(
        JSON.stringify({
          resource: `${baseUrl}/mcp`,
          authorization_servers: [baseUrl],
        }),
      );
      return;
    }
    if (url.pathname.startsWith("/.well-known/oauth-authorization-server")) {
      response.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/authorize`,
          token_endpoint: `${baseUrl}/token`,
          registration_endpoint: `${baseUrl}/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        }),
      );
      return;
    }
    if (url.pathname === "/register") {
      response.statusCode = 201;
      response.end(
        JSON.stringify({
          client_id: "synthetic-client",
          token_endpoint_auth_method: "none",
        }),
      );
      return;
    }
    if (url.pathname === "/token") {
      exchanges += 1;
      response.end(
        JSON.stringify({
          access_token: "synthetic-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      );
      return;
    }
    if (url.pathname !== "/mcp") {
      response.statusCode = 404;
      response.end("{}");
      return;
    }
    if (request.headers.authorization !== "Bearer synthetic-token") {
      response.statusCode = 401;
      response.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
      );
      response.end("{}");
      return;
    }
    if (request.method !== "POST") {
      response.statusCode = 405;
      response.end("{}");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const rpc = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (rpc.id === undefined) {
      response.statusCode = 202;
      response.end();
      return;
    }
    let result: unknown = {};
    if (rpc.method === "initialize")
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "synthetic-app", version: "1" },
      };
    if (rpc.method === "tools/list")
      result = {
        tools: [
          {
            name: "echo",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
            },
            annotations: { readOnlyHint: true },
          },
        ],
      };
    if (rpc.method === "tools/call")
      result = { content: [{ type: "text", text: rpc.params.arguments.text }] };
    response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test listener");
  baseUrl = `http://127.0.0.1:${address.port}`;
  dirs.onCleanup(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const mcp = new DaemonMcpService(
    await dirs.create("app-oauth-"),
    async () => null,
  );
  dirs.onCleanup(() => mcp.dispose());
  await mcp.config.saveServer("synthetic", {
    url: `${baseUrl}/mcp`,
    oauth: { clientName: "Cocurdex" },
  });
  return {
    mcp,
    location: await mcp.location(),
    config: (await mcp.config.readServers()).synthetic,
    exchanges: () => exchanges,
  };
}

describe("application OAuth and tool transport", () => {
  it("accepts a manual remote return URL and uses the stored host credential for real MCP discovery and calls", async () => {
    const { location, config, exchanges } = await setup();
    const signIn = startPiMcpSignIn(location, "synthetic", 15_000, config);
    dirs.onCleanup(() => signIn.cancel());
    const authUrl = await signIn.authUrl;
    expect(authUrl).not.toBeNull();
    const authorization = new URL(authUrl ?? "");
    expect(authorization.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    const returned = new URL(
      authorization.searchParams.get("redirect_uri") ?? "",
    );
    returned.searchParams.set(
      "state",
      authorization.searchParams.get("state") ?? "",
    );
    returned.searchParams.set("code", "synthetic-code");
    signIn.submitRedirectUrl(returned.href);
    await signIn.done;
    expect(exchanges()).toBe(1);
    const client = createPiApplicationClient(location, "synthetic", config);
    try {
      expect(await client.tools()).toMatchObject([
        { name: "echo", readOnly: true },
      ]);
      expect(await client.call("echo", { text: "Round trip" })).toMatchObject({
        content: [{ type: "text", text: "Round trip" }],
      });
    } finally {
      await client.close();
    }
  }, 20_000);

  it("rejects a mismatched OAuth state before exchanging a code", async () => {
    const { location, config, exchanges } = await setup();
    const signIn = startPiMcpSignIn(location, "synthetic", 15_000, config);
    dirs.onCleanup(() => signIn.cancel());
    const authorization = new URL((await signIn.authUrl) ?? "");
    const returned = new URL(
      authorization.searchParams.get("redirect_uri") ?? "",
    );
    returned.searchParams.set("state", "wrong-state");
    returned.searchParams.set("code", "synthetic-code");
    signIn.submitRedirectUrl(returned.href);
    await expect(signIn.done).rejects.toThrow(/different sign-in/i);
    expect(exchanges()).toBe(0);
  }, 20_000);
  it("refuses a stale connection snapshot before creating a transport", async () => {
    const { location, config } = await setup();
    expect(() =>
      createPiApplicationClient(location, "synthetic", {
        ...config,
        enabled: false,
      }),
    ).toThrow("configuration changed");
    expect(() =>
      startPiMcpSignIn(location, "synthetic", 15_000, {
        ...config,
        enabled: false,
      }),
    ).toThrow("configuration changed");
  });
  it("cancels a pending host sign-in before a connection is removed or signed out", async () => {
    const { mcp, location, config, exchanges } = await setup();
    const started = await mcp.logins.start(location, "synthetic", config);
    expect(started.loginId).not.toBeNull();
    await mcp.logins.cancelServer("synthetic");
    const outcome = await mcp.logins.wait(started.loginId ?? "");
    expect(outcome.success).toBe(false);
    expect(exchanges()).toBe(0);
  });
});
