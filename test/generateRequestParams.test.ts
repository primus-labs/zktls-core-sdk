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

const sampleRequest = {
  url: 'https://example.com/api',
  method: 'GET',
  header: {},
  body: '',
};

const sampleResponseResolves = [
  {
    keyName: 'status',
    parsePath: '$.status',
  },
];

const finalResult = {
  retcode: '0',
  content: {
    balanceGreaterThanBaseValue: 'true',
    signature: '0x1',
    encodedData: JSON.stringify({ data: '{}' }),
    privateData: '',
  },
};

describe('generateRequestParams options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAttestationResult as jest.Mock).mockResolvedValue(finalResult);
  });

  it('accepts requestid and attMode through the options object', async () => {
    const client = new PrimusCoreTLS();
    await client.init('app-id', '0x0123456789012345678901234567890123456789012345678901234567890123');

    const attRequest = client.generateRequestParams(sampleRequest, sampleResponseResolves, {
      requestid: 'job-from-options',
      attMode: {
        algorithmType: 'mpctls',
        resultType: 'plain',
      },
      additionParams: 'extra',
      noProxy: false,
      requestInterval: 1000,
    });

    expect(attRequest.requestid).toBe('job-from-options');
    expect(attRequest.attMode).toEqual({
      algorithmType: 'mpctls',
      resultType: 'plain',
    });
    expect(attRequest.additionParams).toBe('extra');
    expect(attRequest.noProxy).toBe(false);
    expect(attRequest.requestInterval).toBe(1000);

    await client.startAttestation(attRequest);

    expect(getAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        requestid: 'job-from-options',
      }),
      expect.any(Object)
    );
  });

  it('keeps legacy userAddress string as the third argument', () => {
    const client = new PrimusCoreTLS();
    const userAddress = '0x1234567890123456789012345678901234567890';

    const attRequest = client.generateRequestParams(
      sampleRequest,
      sampleResponseResolves,
      userAddress
    );

    expect(attRequest.userAddress).toBe(userAddress);
  });

  it('accepts userAddress through the options object', () => {
    const client = new PrimusCoreTLS();
    const userAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

    const attRequest = client.generateRequestParams(sampleRequest, sampleResponseResolves, {
      userAddress,
    });

    expect(attRequest.userAddress).toBe(userAddress);
  });

  it('generates requestid when request params are created', () => {
    const client = new PrimusCoreTLS();

    const attRequest = client.generateRequestParams(sampleRequest, sampleResponseResolves);

    expect(attRequest.requestid).toEqual(expect.any(String));
    expect(attRequest.requestid).toHaveLength(36);
  });
});
