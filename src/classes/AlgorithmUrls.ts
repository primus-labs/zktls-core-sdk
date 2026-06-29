import { sendRequest, getInstanceProperties } from '../utils';
import { BASE_SERVICE_URL, PRIMUS_PROXY_URL, PROXY_URL, PRIMUS_MPC_URL } from '../config/env';

type AlgorithmNode = {
  algorithmDomain: string;
  algoProxyDomain: string;
};

type ResolvedAlgorithmUrls = Pick<AlgorithmUrls, 'primusMpcUrl' | 'primusProxyUrl' | 'proxyUrl'>;

export type FetchNodesOptions = {
  maxRetries?: number;
  fetchTimeoutMs?: number;
  wsTimeoutMs?: number;
  retryDelayMs?: number;
};

const DEFAULT_FETCH_NODES_OPTIONS: Required<FetchNodesOptions> = {
  maxRetries: 3,
  fetchTimeoutMs: 3000,
  wsTimeoutMs: 2000,
  retryDelayMs: 200,
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFetchNodesOptions(options: FetchNodesOptions): Required<FetchNodesOptions> {
  return {
    maxRetries: Math.max(1, Math.floor(options.maxRetries ?? DEFAULT_FETCH_NODES_OPTIONS.maxRetries)),
    fetchTimeoutMs: options.fetchTimeoutMs ?? DEFAULT_FETCH_NODES_OPTIONS.fetchTimeoutMs,
    wsTimeoutMs: options.wsTimeoutMs ?? DEFAULT_FETCH_NODES_OPTIONS.wsTimeoutMs,
    retryDelayMs: options.retryDelayMs ?? DEFAULT_FETCH_NODES_OPTIONS.retryDelayMs,
  };
}

function isAlgorithmNode(value: unknown): value is AlgorithmNode {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const node = value as Partial<AlgorithmNode>;
  return typeof node.algorithmDomain === 'string' && typeof node.algoProxyDomain === 'string';
}

type ProbeWebSocket = {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
};

type WebSocketConstructor = new (url: string) => ProbeWebSocket;

function resolveWebSocketCtor(): WebSocketConstructor {
  if (globalThis.WebSocket) {
    return globalThis.WebSocket as unknown as WebSocketConstructor;
  }
  return require('ws') as WebSocketConstructor;
}

export class AlgorithmUrls {
  primusMpcUrl: string; // PADOURL
  primusProxyUrl: string;// ZKPADOURL
  proxyUrl: string; // PROXYURL

  constructor() {
    this.primusMpcUrl = PRIMUS_MPC_URL;
    this.primusProxyUrl = PRIMUS_PROXY_URL;
    this.proxyUrl = PROXY_URL;
  }

  async fetchNodes(options: FetchNodesOptions = {}): Promise<boolean> {
    const normalizedOptions = normalizeFetchNodesOptions(options);
    for (let attempt = 1; attempt <= normalizedOptions.maxRetries; attempt += 1) {
      try {
        const nodes = await this.fetchNodeList(normalizedOptions.fetchTimeoutMs);
        const selectedUrls = await this.pickReachableNode(nodes, normalizedOptions.wsTimeoutMs);
        if (selectedUrls) {
          this.primusMpcUrl = selectedUrls.primusMpcUrl;
          this.primusProxyUrl = selectedUrls.primusProxyUrl;
          this.proxyUrl = selectedUrls.proxyUrl;
          return true;
        }
      } catch {
        if (attempt >= normalizedOptions.maxRetries) {
          return false;
        }
      }

      if (attempt < normalizedOptions.maxRetries) {
        await wait(normalizedOptions.retryDelayMs * attempt);
      }
    }
    return false;
  }

  private async fetchNodeList(fetchTimeoutMs: number): Promise<AlgorithmNode[]> {
    const fetchNodesUrl = `${BASE_SERVICE_URL}/public/algo/nodes`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);
    try {
      const res = await sendRequest(fetchNodesUrl, { signal: controller.signal });
      if (res?.rc !== 0 || !Array.isArray(res.result)) {
        return [];
      }
      return res.result.filter(isAlgorithmNode);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async pickReachableNode(nodes: AlgorithmNode[], wsTimeoutMs: number): Promise<ResolvedAlgorithmUrls | undefined> {
    const probes = nodes.map(async (node) => {
      const urls = await this.probeNode(node, wsTimeoutMs);
      if (urls) {
        return urls;
      }
      throw new Error(`Algorithm node is not reachable: ${node.algoProxyDomain}`);
    });
    try {
      return await Promise.any(probes);
    } catch {
      return undefined;
    }
  }

  private probeNode(node: AlgorithmNode, wsTimeoutMs: number): Promise<ResolvedAlgorithmUrls | undefined> {
    return new Promise((resolve) => {
      const WebSocketCtor = resolveWebSocketCtor();
      const ws = new WebSocketCtor(`wss://${node.algoProxyDomain}/algoproxy`);
      let settled = false;
      function resolveOnce(urls?: ResolvedAlgorithmUrls) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        ws.close();
        resolve(urls);
      }
      const timeoutId = setTimeout(() => resolveOnce(), wsTimeoutMs);
      ws.onopen = function () {
        resolveOnce({
          primusMpcUrl: `wss://${node.algorithmDomain}/algorithm`,
          primusProxyUrl: `wss://${node.algorithmDomain}/algorithm-proxy`,
          proxyUrl: `wss://${node.algoProxyDomain}/algoproxy`,
        });
      };
      ws.onerror = function () {
        resolveOnce();
      };
    });
  }

  toJsonString() {
    return JSON.stringify(getInstanceProperties(this));
  }
}





