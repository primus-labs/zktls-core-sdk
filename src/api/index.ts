import { request } from '../utils/httpRequest';
import { BASEAPI } from '../config/env';
import { ApiResponse } from './index.d';
export function getAppQuote(params: {appId: string}): Promise<ApiResponse> {
  return request<ApiResponse>({
    url: `${BASEAPI}/public/app/quote`,
    method: 'GET',
    params
  });
}





