export type AppErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'conflict'
  | 'in-use'
  | 'not-found'
  | 'network'
  | 'config'
  | 'unknown';

/** An error whose message is safe and useful to show to the owner. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Field path -> message, for validation errors. */
  readonly fields: Record<string, string>;

  constructor(code: AppErrorCode, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
  }
}

export class MediaInUseError extends AppError {
  readonly usages: { kind: string; refId: string; label: string }[];
  constructor(usages: { kind: string; refId: string; label: string }[]) {
    super('in-use', 'This image is still used on the site.');
    this.name = 'MediaInUseError';
    this.usages = usages;
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
