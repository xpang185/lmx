export class LmxError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "LmxError";
    this.exitCode = exitCode;
  }
}

export const EXIT_SUCCESS = 0;
export const EXIT_RUNTIME = 1;
export const EXIT_USAGE = 2;

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "message" in error;
}
