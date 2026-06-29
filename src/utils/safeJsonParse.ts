import { ZkAttestationError } from '../classes/Error';
import type { AttestationErrorCode } from '../config/error';

type SafeJsonParseOptions = {
  field: string;
  fallbackCode?: AttestationErrorCode;
  data?: unknown;
};

export function safeJsonParse<T = unknown>(value: unknown, options: SafeJsonParseOptions): T {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ZkAttestationError(
      options.fallbackCode ?? '99999',
      `Invalid ${options.field}: expected non-empty JSON string`,
      options.data
    );
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new ZkAttestationError(
      options.fallbackCode ?? '99999',
      `Invalid ${options.field}: malformed JSON`,
      options.data
    );
  }
}
