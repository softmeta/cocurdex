export class ReasonError<R extends string = string> extends Error {
  readonly reason: R;

  constructor(reason: R, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReasonError";
    this.reason = reason;
  }
}

export function errorReason(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("reason" in error)) return null;
  const { reason } = error as { reason: unknown };
  return typeof reason === "string" && reason !== "" ? reason : null;
}
