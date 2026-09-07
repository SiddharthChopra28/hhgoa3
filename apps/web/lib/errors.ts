// Typed errors the UI branches on. `code` is stable; `message` is human-facing.
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

export class UploadTooLargeError extends AppError {
  constructor(size: number, max: number) {
    super("upload_too_large", `Image is ${size} bytes; the limit is ${max} bytes`, 413);
  }
}

export class UnsupportedTypeError extends AppError {
  constructor(mime: string) {
    super("unsupported_type", `Unsupported content type "${mime}"; expected image/*`, 415);
  }
}

export class NoFaceError extends AppError {
  constructor(message = "No face found") {
    super("no_face", message, 422);
  }
}

export class GasTooHighError extends AppError {
  constructor(networkGwei: string, capGwei: string) {
    super(
      "gas_too_high",
      `Network maxFeePerGas ${networkGwei} gwei exceeds the configured cap ${capGwei} gwei; refusing to send`,
      503,
    );
  }
}

export class MissingConfigError extends AppError {
  constructor(name: string) {
    super("missing_config", `${name} is not set`, 500);
  }
}

export class UpstreamError extends AppError {
  constructor(service: string, message: string) {
    super("upstream_error", `${service}: ${message}`, 502);
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
