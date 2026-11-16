/** Structured, JSON-safe error detail for console/diagnostic output. */
export interface ErrorDescription {
  name: string;
  message: string;
  stack?: string;
}

/** Describe any thrown value without assuming it is an Error. */
export function describeError(error: unknown): ErrorDescription {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      name: typeof record.name === 'string' ? record.name : 'Error',
      message: typeof record.message === 'string' ? record.message : String(error),
      stack: typeof record.stack === 'string' ? record.stack : undefined,
    };
  }
  return { name: 'Error', message: String(error) };
}

/** Read a short human-facing message from any thrown value. */
export function errorMessage(error: unknown): string {
  return describeError(error).message;
}

/**
 * Log a failure with the screen/action context a user report needs.
 * One call per failure; callers should not also swallow the error silently.
 */
export function logError(scope: string, error: unknown, context: Record<string, unknown> = {}): void {
  console.error(`[P-16] ${scope}`, { ...context, error: describeError(error) });
}
