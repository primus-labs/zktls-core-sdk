import { AttestationErrorCode, ErrorCodeMAP } from '../config/error';

export type ErrorCode = AttestationErrorCode;

const errorCodeLookup = ErrorCodeMAP as Record<string, string | undefined>;

function resolveZkAttestationErrorMessage(
  code: ErrorCode,
  message: string | undefined,
  subCode: string | undefined
): string | undefined {
  if (message) {
    return message;
  }
  if (subCode) {
    const compositeKey = `${code}:${subCode}`;
    const fromComposite = errorCodeLookup[compositeKey];
    if (fromComposite !== undefined) {
      return fromComposite;
    }
  }
  return errorCodeLookup[code];
}

/** Wire-format `data` field: always a string; omit nested `details` (subCode is top-level). */
function dataForJsonExport(stored: unknown): string {
  if (stored === undefined || stored === null) {
    return '';
  }
  if (typeof stored === 'string') {
    return stored;
  }
  if (typeof stored === 'object' && !Array.isArray(stored)) {
    const o = { ...(stored as Record<string, unknown>) };
    delete o.details;
    if (Object.keys(o).length === 0) {
      return '';
    }
    return JSON.stringify(o);
  }
  return JSON.stringify(stored);
}

export class ZkAttestationError {
  code: ErrorCode;
  message: string;
  /** HTTP-style or domain sub-code when present. */
  subCode?: string;
  data?: any;

  /**
   * @param data - Raw algorithm response payload (or legacy merged payload).
   * @param subCode - Optional sub-code used for composite `code:subCode` message lookup.
   */
  constructor(code: ErrorCode, message?: string, data?: any, subCode?: string) {
    this.subCode = subCode;
    this.message =
      resolveZkAttestationErrorMessage(code, message, subCode) ||
      errorCodeLookup['99999'] ||
      '';
    this.code = code;
    this.data = data;
  }

  /**
   * Shape for `JSON.stringify` / logging: `{ code, message, subCode?, data }` with `data` always a string.
   */
  toJSON(): { code: ErrorCode; message: string; data: string; subCode?: string } {
    const data = dataForJsonExport(this.data);
    if (this.subCode !== undefined && this.subCode !== '') {
      return {
        code: this.code,
        message: this.message,
        subCode: this.subCode,
        data,
      };
    }
    return {
      code: this.code,
      message: this.message,
      data,
    };
  }
}
