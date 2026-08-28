import { ZkAttestationError } from '../src/classes/Error';
import { ErrorCodeMAP } from '../src/config/error';
import type { AttestationErrorCode } from '../src/config/error';

// Codes the SDK surfaces verbatim from the algorithm `extraData.errorCode`
// payload, mirroring KNOWN_EXTRA_DATA_ERROR_CODES in src/index.ts.
const EXTRA_DATA_ERROR_CODES: AttestationErrorCode[] = [
  '-1200010',
  '-1002001',
  '-1002002',
  '-1002003',
  '-1002004',
  '-1002005',
];

const errorCodeLookup = ErrorCodeMAP as Record<string, string | undefined>;

describe('extraData error code messages', () => {
  it('maps -1200010 instead of falling back to the undefined-error text', () => {
    expect(errorCodeLookup['-1200010']).toBe('Invalid message.');
    expect(new ZkAttestationError('-1200010').message).toBe('Invalid message.');
  });

  it.each(EXTRA_DATA_ERROR_CODES)('gives %s a dedicated message', (code) => {
    const genericMessage = new ZkAttestationError('99999').message;
    expect(errorCodeLookup[code]).toBeDefined();
    expect(new ZkAttestationError(code).message).toBe(errorCodeLookup[code]);
    expect(new ZkAttestationError(code).message).not.toBe(genericMessage);
  });
});
