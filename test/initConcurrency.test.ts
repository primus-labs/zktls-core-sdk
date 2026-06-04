import { PrimusCoreTLS } from '../src/index';
import { init } from '../src/primus_zk';
import { ProcessAlgorithmPool } from '../src/algorithm/ProcessAlgorithmPool';

jest.mock('../src/primus_zk', () => ({
  init: jest.fn().mockResolvedValue(true),
  getAttestation: jest.fn(),
  getAttestationResult: jest.fn(),
}));

jest.mock('../src/algorithm/ProcessAlgorithmPool', () => ({
  ProcessAlgorithmPool: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../src/classes/AlgorithmUrls', () => ({
  AlgorithmUrls: jest.fn().mockImplementation(() => ({
    primusMpcUrl: 'wss://example.com/algorithm',
    primusProxyUrl: 'wss://example.com/algorithm-proxy',
    proxyUrl: 'wss://example.com/algoproxy',
  })),
}));

describe('init concurrency options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the existing local algorithm init when concurrency is 1', async () => {
    const client = new PrimusCoreTLS();

    await client.init('app-id', undefined, 'wasm');

    expect(init).toHaveBeenCalledWith('wasm');
    expect(ProcessAlgorithmPool).not.toHaveBeenCalled();
  });

  it('creates a lazy process pool without initializing the local algorithm when concurrency is greater than 1', async () => {
    const client = new PrimusCoreTLS();

    await client.init('app-id', undefined, { backend: 'native', concurrency: 3 });

    expect(init).not.toHaveBeenCalled();
    expect(ProcessAlgorithmPool).toHaveBeenCalledWith({
      backend: 'native',
      concurrency: 3,
    });
  });
});
