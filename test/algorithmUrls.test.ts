import { sendRequest } from '../src/utils';
import { AlgorithmUrls } from '../src/classes/AlgorithmUrls';
import { PRIMUS_MPC_URL, PRIMUS_PROXY_URL, PROXY_URL } from '../src/config/env';

jest.mock('../src/utils', () => ({
  ...jest.requireActual('../src/utils'),
  sendRequest: jest.fn(),
}));

type WebSocketBehavior = 'open' | 'error' | 'timeout';

const wsBehaviorByDomain = new Map<string, WebSocketBehavior>();

class FakeWebSocket {
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = jest.fn();

  constructor(url: string) {
    this.url = url;
    const domain = url.replace(/^wss:\/\//, '').split('/')[0];
    const behavior = wsBehaviorByDomain.get(domain) ?? 'open';

    if (behavior === 'open') {
      queueMicrotask(() => this.onopen?.());
      return;
    }
    if (behavior === 'error') {
      queueMicrotask(() => this.onerror?.());
    }
  }
}

const defaultUrls = {
  primusMpcUrl: PRIMUS_MPC_URL,
  primusProxyUrl: PRIMUS_PROXY_URL,
  proxyUrl: PROXY_URL,
};

const nodeA = {
  algorithmDomain: 'algo-a.example.com',
  algoProxyDomain: 'proxy-a.example.com',
};

const nodeB = {
  algorithmDomain: 'algo-b.example.com',
  algoProxyDomain: 'proxy-b.example.com',
};

const successfulNodeList = {
  rc: 0,
  result: [nodeA, nodeB],
};

const setWsBehavior = (domain: string, behavior: WebSocketBehavior) => {
  wsBehaviorByDomain.set(domain, behavior);
};

describe('AlgorithmUrls.fetchNodes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wsBehaviorByDomain.clear();
    global.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  it('updates urls when the first reachable node is found on the first attempt', async () => {
    (sendRequest as jest.Mock).mockResolvedValue(successfulNodeList);
    setWsBehavior('proxy-a.example.com', 'open');

    const algoUrls = new AlgorithmUrls();
    const result = await algoUrls.fetchNodes({
      maxRetries: 1,
      fetchTimeoutMs: 1000,
      wsTimeoutMs: 1000,
    });

    expect(result).toBe(true);
    expect(sendRequest).toHaveBeenCalledTimes(1);
    expect(algoUrls.primusMpcUrl).toBe('wss://algo-a.example.com/algorithm');
    expect(algoUrls.primusProxyUrl).toBe('wss://algo-a.example.com/algorithm-proxy');
    expect(algoUrls.proxyUrl).toBe('wss://proxy-a.example.com/algoproxy');
  });

  it('selects the first reachable node when earlier nodes fail websocket probes', async () => {
    (sendRequest as jest.Mock).mockResolvedValue(successfulNodeList);
    setWsBehavior('proxy-a.example.com', 'error');
    setWsBehavior('proxy-b.example.com', 'open');

    const algoUrls = new AlgorithmUrls();
    const result = await algoUrls.fetchNodes({
      maxRetries: 1,
      fetchTimeoutMs: 1000,
      wsTimeoutMs: 1000,
    });

    expect(result).toBe(true);
    expect(algoUrls.primusMpcUrl).toBe('wss://algo-b.example.com/algorithm');
    expect(algoUrls.primusProxyUrl).toBe('wss://algo-b.example.com/algorithm-proxy');
    expect(algoUrls.proxyUrl).toBe('wss://proxy-b.example.com/algoproxy');
  });

  it('retries after a failed node list request and succeeds on the next attempt', async () => {
    (sendRequest as jest.Mock)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(successfulNodeList);
    setWsBehavior('proxy-a.example.com', 'open');

    const algoUrls = new AlgorithmUrls();
    const result = await algoUrls.fetchNodes({
      maxRetries: 2,
      fetchTimeoutMs: 1000,
      wsTimeoutMs: 1000,
      retryDelayMs: 1,
    });

    expect(result).toBe(true);
    expect(sendRequest).toHaveBeenCalledTimes(2);
    expect(algoUrls.primusMpcUrl).toBe('wss://algo-a.example.com/algorithm');
  });

  it('retries when all nodes are unreachable and eventually returns false', async () => {
    (sendRequest as jest.Mock).mockResolvedValue(successfulNodeList);
    setWsBehavior('proxy-a.example.com', 'error');
    setWsBehavior('proxy-b.example.com', 'error');

    const algoUrls = new AlgorithmUrls();
    const result = await algoUrls.fetchNodes({
      maxRetries: 2,
      fetchTimeoutMs: 1000,
      wsTimeoutMs: 1000,
      retryDelayMs: 1,
    });

    expect(result).toBe(false);
    expect(sendRequest).toHaveBeenCalledTimes(2);
    expect(algoUrls.primusMpcUrl).toBe(defaultUrls.primusMpcUrl);
    expect(algoUrls.primusProxyUrl).toBe(defaultUrls.primusProxyUrl);
    expect(algoUrls.proxyUrl).toBe(defaultUrls.proxyUrl);
  });

  it('returns false and keeps default urls when the backend keeps returning empty node lists', async () => {
    (sendRequest as jest.Mock).mockResolvedValue({ rc: 0, result: [] });

    const algoUrls = new AlgorithmUrls();
    const result = await algoUrls.fetchNodes({
      maxRetries: 2,
      fetchTimeoutMs: 1000,
      wsTimeoutMs: 1000,
      retryDelayMs: 1,
    });

    expect(result).toBe(false);
    expect(sendRequest).toHaveBeenCalledTimes(2);
    expect(algoUrls.primusMpcUrl).toBe(defaultUrls.primusMpcUrl);
    expect(algoUrls.proxyUrl).toBe(defaultUrls.proxyUrl);
  });

  it('filters invalid node entries before probing websocket endpoints', async () => {
    (sendRequest as jest.Mock).mockResolvedValue({
      rc: 0,
      result: [
        { algorithmDomain: 'broken-node' },
        nodeA,
      ],
    });
    setWsBehavior('proxy-a.example.com', 'open');

    const algoUrls = new AlgorithmUrls();
    const result = await algoUrls.fetchNodes({
      maxRetries: 1,
      fetchTimeoutMs: 1000,
      wsTimeoutMs: 1000,
    });

    expect(result).toBe(true);
    expect(algoUrls.primusMpcUrl).toBe('wss://algo-a.example.com/algorithm');
  });

  it('waits with incremental backoff between retry attempts', async () => {
    jest.useFakeTimers();
    (sendRequest as jest.Mock).mockResolvedValue({ rc: 0, result: [] });

    const algoUrls = new AlgorithmUrls();
    const fetchPromise = algoUrls.fetchNodes({
      maxRetries: 3,
      fetchTimeoutMs: 1000,
      wsTimeoutMs: 1000,
      retryDelayMs: 100,
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(sendRequest).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(100);
    expect(sendRequest).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(200);
    expect(sendRequest).toHaveBeenCalledTimes(3);

    await expect(fetchPromise).resolves.toBe(false);
    jest.useRealTimers();
  });
});
