import { PrimusCoreTLS } from '../src/index';
import { eventReport } from '../src/utils/eventReport';

const runAttestation = jest.fn();

jest.mock('../src/primus_zk', () => ({
  init: jest.fn().mockResolvedValue(true),
  getAttestation: jest.fn(),
  getAttestationResult: jest.fn(),
}));

jest.mock('../src/algorithm/ProcessAlgorithmPool', () => ({
  ProcessAlgorithmPool: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(undefined),
    runAttestation,
  })),
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
      remainingQuota: 10,
    },
  }),
}));

jest.mock('../src/utils/eventReport', () => ({
  eventReport: jest.fn().mockResolvedValue(undefined),
}));

const makeRequest = (client: PrimusCoreTLS) =>
  client.generateRequestParams(
    {
      url: 'https://example.com/api',
      method: 'GET',
      header: {},
      body: '',
    },
    [
      {
        keyName: 'status',
        parsePath: '$.status',
      },
    ]
  );

describe('concurrent start failure reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports child-process getAttestation start failures with the legacy start failure code', async () => {
    runAttestation.mockResolvedValue({
      phase: 'start',
      result: {
        retcode: '2',
      },
    });

    const client = new PrimusCoreTLS();
    await client.init('app-id', '0x0123456789012345678901234567890123456789012345678901234567890123', {
      backend: 'native',
      concurrency: 2,
    });

    await expect(client.startAttestation(makeRequest(client))).rejects.toMatchObject({ code: '00001' });

    expect(eventReport).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        detail: expect.objectContaining({
          code: '00001',
        }),
      })
    );
  });
});
