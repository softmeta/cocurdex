export class AgentToolInputError extends Error {
  override readonly name = "AgentToolInputError";
}

type SchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object"
  | "null";

function matchesType(value: unknown, type: SchemaType) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
    case "null":
      return value === null;
  }
}

function allowedTypes(schema: Record<string, unknown>): SchemaType[] {
  const type = schema.type;
  if (typeof type === "string") return [type as SchemaType];
  if (Array.isArray(type)) return type as SchemaType[];
  return [];
}

export function validateAgentToolInput(
  schema: Record<string, unknown>,
  input: unknown,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new AgentToolInputError("Tool input must be an object");
  }
  const record = input as Record<string, unknown>;
  const properties =
    typeof schema.properties === "object" && schema.properties !== null
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {};
  const required = Array.isArray(schema.required)
    ? (schema.required as string[])
    : [];
  for (const key of required) {
    if (record[key] === undefined) {
      throw new AgentToolInputError(`Missing required field '${key}'`);
    }
  }
  for (const [key, value] of Object.entries(record)) {
    const property = properties[key];
    if (!property) {
      if (schema.additionalProperties === false) {
        throw new AgentToolInputError(`Unexpected field '${key}'`);
      }
      continue;
    }
    const types = allowedTypes(property);
    if (types.length > 0 && !types.some((type) => matchesType(value, type))) {
      throw new AgentToolInputError(
        `Field '${key}' must be ${types.join(" or ")}`,
      );
    }
    if (Array.isArray(property.enum) && !property.enum.includes(value)) {
      throw new AgentToolInputError(
        `Field '${key}' must be one of ${property.enum.join(", ")}`,
      );
    }
  }
  return record;
}
