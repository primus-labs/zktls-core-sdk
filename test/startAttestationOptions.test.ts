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

const finalResult = {
  retcode: '0',
  content: {
    balanceGreaterThanBaseValue: 'true',
    signature: '0x1',
    encodedData: JSON.stringify({ data: '{}' }),
    privateData: '',
  },
};

describe('startAttestation options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits stream progress events from getAttestationResult options', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id', '0x0123456789012345678901234567890123456789012345678901234567890123');

    (getAttestationResult as jest.Mock).mockImplementation(async (options) => {
      await options.onResult({
        retcode: '1',
        status: 'streaming',
        content: {
          sequence: 7,
          data: { chunk: 'hello' },
        },
      });
      return finalResult;
    });

    const onProgress = jest.fn();
    await client.startAttestation(makeRequest(client), {
      timeout: 1234,
      pollIntervalMs: 25,
      stream: true,
      onProgress,
    });

    expect(getAttestationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 1234,
        pollIntervalMs: 25,
        onResult: expect.any(Function),
      })
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stream-data',
        sequence: 7,
        data: { chunk: 'hello' },
      })
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'proof-ready',
      })
    );
  });

  it('keeps the existing concurrency=1 rejection behavior', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id', '0x0123456789012345678901234567890123456789012345678901234567890123');

    let resolveFirst!: (value: unknown) => void;
    (getAttestationResult as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );

    const first = client.startAttestation(makeRequest(client));
    const second = client.startAttestation(makeRequest(client));

    await expect(second).rejects.toMatchObject({ code: '00003' });
    resolveFirst(finalResult);
    await first;
  });
});
