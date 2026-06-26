import { PrimusCoreTLS } from '../src/index';
import { getAttestation, getAttestationResult } from '../src/primus_zk';

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
    fetchNodes: jest.fn().mockResolvedValue(true),
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
    (getAttestation as jest.Mock).mockResolvedValue({ retcode: '0' });
    (getAttestationResult as jest.Mock).mockReset();
  });

  it('does not emit stream progress events from getAttestationResult polling results', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id', '0x0123456789012345678901234567890123456789012345678901234567890123');

    (getAttestationResult as jest.Mock).mockImplementation(async (options) => {
      await options.onResult?.({
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
      })
    );
    expect(getAttestationResult).not.toHaveBeenCalledWith(
      expect.objectContaining({
        onResult: expect.any(Function),
      })
    );
    expect(onProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stream-data',
      })
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'proof-ready',
      })
    );
    expect(onProgress.mock.calls[0][0]).not.toHaveProperty('raw');
  });

  it('passes stream option to getAttestation params', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id', '0x0123456789012345678901234567890123456789012345678901234567890123');

    (getAttestationResult as jest.Mock).mockResolvedValue(finalResult);

    await client.startAttestation(makeRequest(client), {
      stream: true,
    });

    expect(getAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: true,
      }),
      expect.any(Object)
    );
  });

  it('uses a user supplied requestid for attestation params', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id', '0x0123456789012345678901234567890123456789012345678901234567890123');

    (getAttestationResult as jest.Mock).mockResolvedValue(finalResult);

    const attRequest = makeRequest(client);
    attRequest.setRequestId('job-123:abc');
    await client.startAttestation(attRequest);

    expect(getAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        requestid: 'job-123:abc',
      }),
      expect.any(Object)
    );
    expect(attRequest.requestid).toBe('job-123:abc');
  });

  it('uses requestid from a backend signed request string', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id');

    (getAttestationResult as jest.Mock).mockResolvedValue(finalResult);

    const attRequest = makeRequest(client);
    attRequest.setRequestId('backend-job-123');
    const signedRequest = JSON.stringify({
      attRequest: JSON.parse(attRequest.toJsonString()),
      appSignature: '0xsignature',
    });

    await client.startAttestation(signedRequest);

    expect(getAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        requestid: 'backend-job-123',
      }),
      expect.any(Object)
    );
  });

  it('generates and writes back requestid when the user does not supply one', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id', '0x0123456789012345678901234567890123456789012345678901234567890123');

    (getAttestationResult as jest.Mock).mockResolvedValue(finalResult);

    const attRequest = makeRequest(client);
    expect(attRequest.requestid).toEqual(expect.any(String));
    await client.startAttestation(attRequest);

    const [attParams] = (getAttestation as jest.Mock).mock.calls[0];
    expect(attParams.requestid).toEqual(expect.any(String));
    expect(attParams.requestid).toHaveLength(36);
    expect(attRequest.requestid).toBe(attParams.requestid);
  });

  it('rejects invalid user supplied requestid', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id', '0x0123456789012345678901234567890123456789012345678901234567890123');

    const attRequest = makeRequest(client);
    expect(() => attRequest.setRequestId('invalid request id')).toThrow(
      expect.objectContaining({
        code: '00005',
      })
    );
    expect(getAttestation).not.toHaveBeenCalled();
  });

  it('rejects invalid requestid from a backend signed request string', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id');

    const attRequest = makeRequest(client);
    const signedRequest = JSON.stringify({
      attRequest: {
        ...JSON.parse(attRequest.toJsonString()),
        requestid: 'invalid request id',
      },
      appSignature: '0xsignature',
    });

    await expect(client.startAttestation(signedRequest)).rejects.toMatchObject({
      code: '00005',
    });
    expect(getAttestation).not.toHaveBeenCalled();
  });

  it('emits stream progress events from getAttestation stream callback', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id', '0x0123456789012345678901234567890123456789012345678901234567890123');

    (getAttestation as jest.Mock).mockImplementation(async (_params, options) => {
      await options.onStream({
        retcode: '1',
        status: 'streaming',
        content: {
          sequence: 8,
          data: { chunk: 'native-stream' },
        },
      });
      return { retcode: '0' };
    });
    (getAttestationResult as jest.Mock).mockResolvedValue(finalResult);

    const onProgress = jest.fn();
    await client.startAttestation(makeRequest(client), {
      stream: true,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stream-data',
        sequence: 8,
        data: { chunk: 'native-stream' },
      })
    );
    expect(onProgress.mock.calls[0][0]).not.toHaveProperty('raw');
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
