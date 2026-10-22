// test/httpRequest.test.ts
import { request } from '../src/utils/httpRequest';

describe('httpRequest', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('parses JSON from response text without consuming the body twice', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: jest.fn().mockResolvedValue('{"rc":0}'),
      json: jest.fn(),
    } as unknown as Response);

    await expect(request({ url: 'https://example.com/api' })).resolves.toEqual({ rc: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.results[0].value).resolves.toBeDefined();
  });

  it('returns raw text when JSON parsing fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: jest.fn().mockResolvedValue('not-json'),
    } as unknown as Response);

    await expect(request({ url: 'https://example.com/api' })).resolves.toBe('not-json');
  });

  it('attaches parsed error payload when a JSON error response is returned', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: jest.fn().mockResolvedValue('{"message":"bad request"}'),
    } as unknown as Response);

    await expect(request({ url: 'https://example.com/api' })).rejects.toMatchObject({
      status: 400,
      data: { message: 'bad request' },
    });
  });

  it.each(['json', 'text', 'blob', 'arrayBuffer'] as const)(
    'keeps the timeout active while reading the %s response body',
    async (responseType) => {
      jest.useFakeTimers();
      const bodyMethod = responseType === 'json' ? 'text' : responseType;
      jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
        const signal = options?.signal as AbortSignal;
        return Promise.resolve({
          ok: true,
          [bodyMethod]: () => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              const error = new Error('Response body aborted');
              error.name = 'AbortError';
              reject(error);
            }, { once: true });
          }),
        } as unknown as Response);
      });
      const onFailure = jest.fn();
      const result = request({ url: 'https://example.com/api', responseType, timeout: 50 }).catch(onFailure);

      await jest.advanceTimersByTimeAsync(50);

      expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
        code: 'TIMEOUT',
        message: 'Request timeout after 50ms',
      }));
      await result;
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  it('clears the timer after reading the response body successfully', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('{"rc":0}'),
    } as unknown as Response);

    await expect(request({ url: 'https://example.com/api', timeout: 50 })).resolves.toEqual({ rc: 0 });

    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timer and preserves a response body read error', async () => {
    jest.useFakeTimers();
    const bodyError = new Error('Response body failed');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockRejectedValue(bodyError),
    } as unknown as Response);

    await expect(request({ url: 'https://example.com/api', timeout: 50 })).rejects.toBe(bodyError);

    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timer and preserves network error handling when fetch rejects', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    await expect(request({ url: 'https://example.com/api', timeout: 50 })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Network error: fetch failed',
    });

    expect(jest.getTimerCount()).toBe(0);
  });
});
