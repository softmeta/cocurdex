import { afterEach, describe, expect, it } from "vitest";
import { type ApiApp, createApp } from "./app";

describe("createApp", () => {
  let app: ApiApp | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("exposes a health endpoint", async () => {
    app = await createApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "cocurdex-api",
    });
  });
});
