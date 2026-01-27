import { request } from '../utils/httpRequest';
import { BASEAPI } from '../config/env';
import { ApiResponse } from '../index.d';
import type { EventReportRawData, EventReportRequest } from './index.d';


export function reportEvent(rawDataObj: EventReportRawData): Promise<ApiResponse<any[]>> {
  const data: EventReportRequest = {
    eventType: "ATTESTATION_GENERATE",
    rawData: JSON.stringify(rawDataObj)
  };
  return request<ApiResponse<any[]>>({
    url: `${BASEAPI}/public/event/report`,
    method: 'POST',
    data: data
  });
}





