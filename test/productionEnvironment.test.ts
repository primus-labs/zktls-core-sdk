import { PrimusCoreTLS } from '../src/index';
import { AlgorithmUrls } from '../src/classes/AlgorithmUrls';
import * as env from '../src/config/env';
import * as utils from '../src/utils';
import { getAttestation } from '../src/primus_zk';

jest.mock('../src/primus_zk', () => ({
  init: jest.fn(),
  getAttestation: jest.fn(),
  getAttestationResult: jest.fn(),
}));

jest.mock('../src/utils/eventReport', () => ({
  eventReport: jest.fn().mockResolvedValue(undefined),
}));

describe('production environment defaults', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps service, algorithm and verification defaults in production', () => {
    expect({ ...env }).toEqual({
      BASEAPI: 'https://api.padolabs.org',
      BASE_SERVICE_URL: 'https://api.padolabs.org',
      PRIMUS_MPC_URL: 'wss://api2.padolabs.org/algorithm',
      PRIMUS_PROXY_URL: 'wss://api2.padolabs.org/algorithm-proxy',
      PROXY_URL: 'wss://api2.padolabs.org/algoproxy',
      PADO_ADDRESS: '0x5Ed3176045F68617B0958a61ac1868875C98C14d',
    });
  });

  it('discovers production nodes and retains production fallbacks for an empty list', async () => {
    const sendRequest = jest.spyOn(utils, 'sendRequest').mockResolvedValue({ rc: 0, result: [] });
    const urls = new AlgorithmUrls();
    await expect(urls.fetchNodes({ maxRetries: 1 })).resolves.toBe(false);
    expect(sendRequest).toHaveBeenCalledWith(
      'https://api.padolabs.org/public/algo/nodes',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(urls.primusMpcUrl).toBe('wss://api2.padolabs.org/algorithm');
    expect(urls.primusProxyUrl).toBe('wss://api2.padolabs.org/algorithm-proxy');
    expect(urls.proxyUrl).toBe('wss://api2.padolabs.org/algoproxy');
  });

  it('reaches the algorithm for a project recognized only by the production quote service', async () => {
    const appId = 'production-project-fixture';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname !== '/public/app/quote') throw new Error('Unexpected request');
      expect(url.searchParams.get('appId')).toBe(appId);
      return new Response(JSON.stringify({
        rc: 0,
        result: url.origin === 'https://api.padolabs.org'
          ? { remainingQuota: 100, expiryTime: null }
          : null,
      }), { status: 200 });
    });
    const reachedAlgorithm = new Error('Algorithm reached; no live proof requested');
    (getAttestation as jest.Mock).mockRejectedValueOnce(reachedAlgorithm);
    const client = new PrimusCoreTLS();
    client.appId = appId;
    const request = client.generateRequestParams(
      { url: 'https://example.com/api', method: 'GET', header: {}, body: '' },
      [{ keyName: 'status', parsePath: '$.status' }]
    );
    const signedRequest = JSON.stringify({
      attRequest: JSON.parse(request.toJsonString()),
      appSignature: 'offline-signature-fixture',
    });
    await expect(client.startAttestation(signedRequest)).rejects.toBe(reachedAlgorithm);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        padoUrl: 'wss://api2.padolabs.org/algorithm-proxy',
        proxyUrl: 'wss://api2.padolabs.org/algoproxy',
      }),
      expect.any(Object)
    );
  });
});
