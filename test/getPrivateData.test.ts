import { PrimusCoreTLS } from '../src/index';
import { getAttestationResult } from '../src/primus_zk';

jest.mock('../src/primus_zk', () => ({
  init: jest.fn().mockResolvedValue(true),
  getAttestation: jest.fn().mockResolvedValue({ retcode: '0' }),
  getAttestationResult: jest.fn(),
}));

jest.mock('../src/classes/AlgorithmUrls', () => ({
  AlgorithmUrls: jest.fn().mockImplementation(() => ({
    primusMpcUrl: 'wss://example.com/algorithm',
    primusProxyUrl: 'wss://example.com/algorithm-proxy',
    proxyUrl: 'wss://example.com/algoproxy',
  })),
}));

jest.mock('../src/api', () => ({
  getAppQuote: jest.fn().mockResolvedValue({
    rc: 0,
    result: {
      expiryTime: Date.now() + 60_000,
      remainingQuota: 1,
    },
  }),
}));

jest.mock('../src/utils/eventReport', () => ({
  eventReport: jest.fn().mockResolvedValue(undefined),
}));

describe('getPrivateData', () => {
  it('returns private data by request id and key name', async () => {
    const zkTLS = new PrimusCoreTLS();
    await zkTLS.init(
      'app-id',
      '0x0123456789012345678901234567890123456789012345678901234567890123'
    );

    (getAttestationResult as jest.Mock).mockResolvedValue({
      retcode: '0',
      content: {
        balanceGreaterThanBaseValue: 'true',
        signature: '0x1',
        encodedData: JSON.stringify({ data: '{}' }),
        privateData: JSON.stringify({ accessToken: 'secret-token' }),
      },
    });

    const request = {
      url: 'https://example.com/api',
      method: 'GET',
      header: {},
      body: '',
    };
    const responseResolves = [
      {
        keyName: 'status',
        parsePath: '$.status',
      },
    ];

    const attRequest = zkTLS.generateRequestParams(request, responseResolves);
    await zkTLS.startAttestation(attRequest);

    expect(attRequest.requestid).toBeTruthy();
    expect(zkTLS.getPrivateData(attRequest.requestid as string, 'accessToken')).toBe('secret-token');
    expect(zkTLS.getPrivateData(attRequest.requestid as string, 'missing')).toBeUndefined();
    expect(zkTLS.getPrivateData('missing-request-id', 'accessToken')).toBeUndefined();
  });
});
