import { reportEvent } from '../api';
import type { EventReportRawData } from '../api/index.d';

/** Never rejects — failures must not affect attestation flow. */
function eventReport(rawDataObj: EventReportRawData): Promise<void> {
  return Promise.resolve()
    .then(() => reportEvent(rawDataObj))
    .then(() => undefined)
    .catch(() => undefined);
}

export { eventReport };