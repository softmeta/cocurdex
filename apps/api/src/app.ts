import Fastify from "fastify";

/**
 * Cloud API HTTP shell (ADR 0003).
 *
 * Transport only: routes, hooks, and serialization. Team auth, org membership,
 * and sync domain logic belong in packages / plain modules — not Fastify
 * plugins that bake in a cloud vendor. Clients (desktop + console) depend on
 * stable HTTP + JSON contracts, not on this framework.
 */
export async function createApp() {
  const app = Fastify({
    logger: false,
  });

  app.get("/health", async () => ({
    ok: true,
    service: "cocurdex-api",
    version: "0.1.0",
  }));

  return app;
}

export type ApiApp = Awaited<ReturnType<typeof createApp>>;
