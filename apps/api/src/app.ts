import Fastify from "fastify";

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
