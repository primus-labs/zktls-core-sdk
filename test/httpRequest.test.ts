import { request } from '../src/utils/httpRequest';

describe('httpRequest', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
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
});
