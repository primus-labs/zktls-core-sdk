/**
 * HTTP Request Utility - A wrapper based on fetch API
 */

export interface RequestConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
}

async function readResponseData(
  response: Response,
  responseType: NonNullable<RequestConfig['responseType']>
): Promise<unknown> {
  switch (responseType) {
    case 'text':
      return response.text();
    case 'blob':
      return response.blob();
    case 'arrayBuffer':
      return response.arrayBuffer();
    case 'json':
    default: {
      const text = await response.text();
      if (text.trim() === '') {
        return text;
      }
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  }
}

export async function request<T = any>(config: RequestConfig): Promise<T> {
  const {
    url,
    method = 'GET',
    headers = {},
    params,
    data,
    timeout = 50000,
    responseType = 'json'
  } = config;

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());
  
  let fullUrl = url;
  if (!hasBody && params && Object.keys(params).length > 0) {
    const urlObj = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        urlObj.searchParams.append(key, String(value));
      }
    });
    fullUrl = urlObj.toString();
  }

  let body: string | undefined;
  if (hasBody) {
    const bodyData = data !== undefined ? data : params;
    if (bodyData !== undefined && bodyData !== null) {
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
      
      const contentType = headers['Content-Type'] || headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        body = JSON.stringify(bodyData);
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        body = new URLSearchParams(bodyData as Record<string, string>).toString();
      } else {
        body = String(bodyData);
      }
    }
  }

  const controller = new AbortController();
  const timeoutId = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const response = await fetch(fullUrl, {
      method,
      headers,
      body,
      signal: controller.signal
    });

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const responseData = await readResponseData(response, responseType);

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as any;
      error.status = response.status;
      error.statusText = response.statusText;
      error.data = responseData;
      throw error;
    }

    return responseData as T;
  } catch (error: any) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Request timeout after ${timeout}ms`) as any;
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      const networkError = new Error(`Network error: ${error.message}`) as any;
      networkError.code = 'NETWORK_ERROR';
      throw networkError;
    }

    throw error;
  }
}
