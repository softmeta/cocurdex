import path from "node:path";
import type { DaemonMethod, DaemonRequestPayloadByMethod } from "@cocurdex/rpc";
import {
  type AcpRegistryAgentId,
  type AgentId,
  isAcpRegistryAgentId,
  isAgentId,
  isToolCallId,
} from "@cocurdex/shared";
import { z } from "zod";

export type Payload<M extends DaemonMethod> = DaemonRequestPayloadByMethod[M];

export type PayloadSchemas = {
  [M in DaemonMethod]?: z.ZodType<Payload<M>>;
};

type MissingKeys<S extends z.ZodType, T> = Exclude<keyof T, keyof z.output<S>>;

type ExactSchema<S extends z.ZodType, T> =
  z.output<S> extends T
    ? [MissingKeys<S, T>] extends [never]
      ? S
      : never
    : never;

export function exact<T>() {
  return <S extends z.ZodType>(schema: S & ExactSchema<S, T>) =>
    schema as unknown as z.ZodType<T>;
}

export function loose<T>() {
  return (schema: z.ZodType) => schema as unknown as z.ZodType<T>;
}

export const noNullByte = (value: string) => !value.includes("\0");

export const idSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_.:@-]+$/);

export const uuidSchema = z.uuid();

export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const filesystemPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(noNullByte, "path contains null byte")
  .refine((value) => path.isAbsolute(value), "path must be absolute");

export const gitRelativePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(noNullByte, "path contains null byte")
  .refine((value) => !path.isAbsolute(value), "path must be relative")
  .refine(
    (value) => !value.split(/[\\/]+/).includes(".."),
    "path must stay within the workspace",
  );

export const providerRequestIdSchema = z
  .string()
  .refine(isToolCallId, "Invalid provider request ID");

export const toolCallIdSchema = z
  .string()
  .refine(isToolCallId, "Invalid tool call ID");

export const providerIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(noNullByte, "null byte");

export const agentIdSchema = z
  .string()
  .min(1)
  .max(80)
  .refine(isAgentId, "unknown agent")
  .transform((value) => value as AgentId);

export const acpRegistryAgentIdSchema = z
  .string()
  .min(1)
  .max(80)
  .refine(isAcpRegistryAgentId, "not a registry agent")
  .transform((value) => value as AcpRegistryAgentId);

export const boundedTextSchema = (max: number) =>
  z.string().max(max).refine(noNullByte, "null byte");

export const sessionIdPayload = z.object({ sessionId: idSchema });

export const rootPathPayload = z.object({ rootPath: filesystemPathSchema });

export const filePathPayload = z.object({ filePath: filesystemPathSchema });
