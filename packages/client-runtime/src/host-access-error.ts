export type HostAccessFailure =
  | "invalid"
  | "offline"
  | "pending"
  | "rateLimited"
  | "unreachable";

export class HostAccessError extends Error {
  readonly reason: HostAccessFailure;

  constructor(reason: HostAccessFailure, message: string) {
    super(message);
    this.name = "HostAccessError";
    this.reason = reason;
  }
}
