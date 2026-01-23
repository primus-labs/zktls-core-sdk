import { request } from './httpRequest';

/**
 * Event detail interface
 */
interface EventDetail {
  code: string;
  desc: string;
}

/**
 * Client type enum
 */
type ClientType = 
  | '@primuslabs/extension'
  | '@primuslabs/zktls-js-sdk'
  | '@primuslabs/zktls-core-sdk'
  | '@primuslabs/network-js-sdk'
  | '@primuslabs/network-core-sdk';

/**
 * Event report raw data interface
 */
interface EventReportRawData {
  source?: string;
  clientType: ClientType;
  appId?: string; // Optional
  templateId?: string;
  address?: string;
  status: 'SUCCESS' | 'FAILED';
  detail?: EventDetail;
  ext?: Record<string, any>; // Optional, value is an object
}

/**
 * Event report request data interface
 */
interface EventReportRequest {
  eventType: string;
  rawData: string;
}

async function eventReport(rawDataObj: EventReportRawData) {
  try {
    const requestData: EventReportRequest = {
      eventType: "ATTESTATION_GENERATE",
      rawData: JSON.stringify(rawDataObj)
    };

    await request<{ rc: number; mc: string; msg: string; result: any[] }>({
      url: 'https://api-dev.padolabs.org/public/event/report',
      method: 'POST',
      data: requestData
    });
  } catch (error: any) {
    console.error('event report failed:', error);
  }
}


export {
  eventReport
};

export type {
  EventReportRawData,
  EventDetail,
  EventReportRequest,
  ClientType
};
