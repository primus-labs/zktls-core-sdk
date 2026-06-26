import { v4 as uuidv4 } from 'uuid';
import { ZkAttestationError } from '../classes/Error';

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function createRequestId(): string {
  return uuidv4();
}

export function normalizeRequestId(requestid?: string): string {
  if (requestid === undefined) {
    return createRequestId();
  }
  const trimmedRequestId = requestid.trim();
  if (!REQUEST_ID_PATTERN.test(trimmedRequestId)) {
    throw new ZkAttestationError('00005', 'Invalid requestid: use 1-128 characters from A-Z, a-z, 0-9, dot, underscore, colon, or hyphen');
  }
  return trimmedRequestId;
}
