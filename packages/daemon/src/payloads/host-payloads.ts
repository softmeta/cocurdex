import { HOST_ACCESS_SCOPES } from "@cocurdex/shared";
import { z } from "zod";
import { idSchema, type PayloadSchemas } from "./primitives";

const remoteAccessSettings = z.object({
  enabled: z.boolean(),
  port: z.number().int().min(1024).max(65_535),
  keepAwake: z.boolean().optional(),
});

const relayCredential = z.object({
  accountId: z.string().min(1).max(200),
  expiresAt: z.number().int().positive(),
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
});

const relaySettings = z.object({
  url: z.string().trim().min(1).max(2048).nullable(),
  relayOnly: z.boolean().optional(),
  credential: relayCredential.nullable().optional(),
});

const deviceScopes = z
  .array(z.enum(HOST_ACCESS_SCOPES))
  .min(1)
  .max(HOST_ACCESS_SCOPES.length);

const createPairing = z.object({
  label: z.string().trim().min(1).max(120),
  scopes: deviceScopes,
  ttlMinutes: z.number().int().min(1).max(60).optional(),
});

export const hostPayloadSchemas: PayloadSchemas = {
  "host.remoteAccess.set": remoteAccessSettings,
  "host.relay.set": relaySettings,
  "host.pairing.create": createPairing,
  "host.pairing.cancel": z.object({ pairingId: idSchema }),
  "host.devices.revoke": z.object({ deviceId: idSchema }),
  "host.devices.updateScopes": z.object({
    deviceId: idSchema,
    scopes: deviceScopes,
  }),
  "host.audit.list": z.object({
    limit: z.number().int().min(1).max(500).optional(),
  }),
};
