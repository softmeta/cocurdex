import { createApp } from "./app";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

const app = await createApp();

await app.listen({ port, host });
process.stdout.write(`@cocurdex/api listening on http://${host}:${port}\n`);
