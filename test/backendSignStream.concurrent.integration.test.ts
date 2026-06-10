import http, { IncomingMessage, Server } from 'http';

import { PrimusCoreTLS } from '../src/index';
import type { AttRequest } from '../src/classes/AttRequest';
import type { AttestationProgressEvent } from '../src/index.d';

const STREAM_TIMEOUT_MS = 10 * 60 * 1000;
const STREAM_CONCURRENCY = 2;
const STREAM_REQUEST_COUNT = 2;
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
const shouldRunBackendSignStreamIntegration =
  process.env.ZKTLS_BACKEND_SIGN_STREAM_INTEGRATION === 'true' ||
  process.env.ZKTLS_STREAM_INTEGRATION === 'true';
const describeBackendSignStreamIntegration = shouldRunBackendSignStreamIntegration ? describe : describe.skip;

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(
      `${name} must be set in .env when ZKTLS_BACKEND_SIGN_STREAM_INTEGRATION=true or ZKTLS_STREAM_INTEGRATION=true`
    );
  }
  return value.trim();
};

const requireOpenAIStreamUrl = () => {
  const value = requireEnv('OPENAI_API_URL');
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error('OPENAI_API_URL must use https for zkTLS stream integration tests');
  }
  if (!url.pathname.endsWith('/chat/completions')) {
    throw new Error('OPENAI_API_URL must be the full chat completions endpoint, e.g. /v1/chat/completions');
  }
  return value;
};

const readBody = (req: IncomingMessage): Promise<string> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
};

const listen = (server: Server): Promise<string> => {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to get backend sign stream server address');
      }
      resolve(`http://127.0.0.1:${address.port}/primus/sign`);
    });
  });
};

const close = (server: Server): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const buildOpenAIStreamAttRequest = (client: PrimusCoreTLS, index: number) => {
  const openAIUrl = requireOpenAIStreamUrl();
  const openAIKey = requireEnv('OPENAI_API_KEY');
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;

  const attRequest = client.generateRequestParams(
    {
      url: openAIUrl,
      method: 'POST',
      header: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: `Reply with exactly: zktls-backend-sign-stream-${index}`,
          },
        ],
        stream: true,
        temperature: 0,
      }),
    },
    [
      {
        keyName: 'openai_stream',
        parseType: 'json',
        parsePath: '$',
      },
    ]
  );

  attRequest.setAttMode({
    algorithmType: 'proxytls',
    resultType: 'plain',
  });

  return attRequest;
};

const stringifyStreamLog = (value: unknown) =>
  JSON.stringify(value, (_key, item) => {
    if (item instanceof Uint8Array) {
      return Buffer.from(item).toString('utf8');
    }
    return item;
  });

const expectConcurrentStreamEvents = (events: AttestationProgressEvent[]) => {
  expect(events.some((event) => event.type === 'stream-data')).toBe(true);
  expect(events.some((event) => event.type === 'proof-ready')).toBe(true);
  expect(new Set(events.map((event) => event.requestId)).size).toBe(1);
};

describeBackendSignStreamIntegration('backend signed concurrent OpenAI stream attestation', () => {
  jest.setTimeout(STREAM_TIMEOUT_MS * Math.max(2, STREAM_REQUEST_COUNT));

  const appId = process.env.ZKTLS_APP_ID;
  const appSecret = process.env.ZKTLS_APP_SECRET;
  let server: Server;
  let signUrl: string;

  const getBackendSignedRequest = async (attRequest: AttRequest): Promise<string> => {
    const signResponse = await fetch(signUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: attRequest.toJsonString(),
    });
    const signResponseJson = await signResponse.json();
    const signedRequestStr = signResponseJson?.result?.signResult;

    if (!signedRequestStr || typeof signedRequestStr !== 'string') {
      throw new Error(`Invalid sign response: ${JSON.stringify(signResponseJson)}`);
    }

    return signedRequestStr;
  };

  beforeAll(async () => {
    requireEnv('ZKTLS_APP_ID');
    requireEnv('ZKTLS_APP_SECRET');
    requireEnv('OPENAI_API_KEY');
    requireOpenAIStreamUrl();

    server = http.createServer(async (req, res) => {
      try {
        const signParams = await readBody(req);
        const signer = new PrimusCoreTLS();
        await signer.init(appId!, appSecret!);
        const signResult = await signer.sign(signParams);

        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            rc: 0,
            result: {
              signResult,
            },
          })
        );
      } catch (error: unknown) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            rc: -1,
            msg: error instanceof Error ? error.message : 'Sign failed',
          })
        );
      }
    });
    signUrl = await listen(server);
  });

  afterAll(async () => {
    if (server) {
      await close(server);
    }
  });

  it(`routes ${STREAM_REQUEST_COUNT} backend signed stream attestations through their own callbacks`, async () => {
    const client = new PrimusCoreTLS();
    await client.init(appId!, undefined, {
      concurrency: STREAM_CONCURRENCY,
    });

    const eventsByRequest = Array.from({ length: STREAM_REQUEST_COUNT }, () => [] as AttestationProgressEvent[]);
    try {
      const attRequests = Array.from({ length: STREAM_REQUEST_COUNT }, (_, index) =>
        buildOpenAIStreamAttRequest(client, index)
      );
      const signedRequestStrs = await Promise.all(attRequests.map(getBackendSignedRequest));
      const attestations = await Promise.all(
        signedRequestStrs.map((signedRequestStr, index) =>
          client.startAttestation(signedRequestStr, {
            timeout: STREAM_TIMEOUT_MS,
            stream: true,
            onProgress: (event) => {
              console.log(
                `backend signed openai concurrent stream ${index} onProgress event=`,
                stringifyStreamLog(event)
              );
              if (event.type === 'stream-data') {
                console.log(
                  `backend signed openai concurrent stream ${index} onProgress string=`,
                  Buffer.from(event.data as Uint8Array).toString('utf8')
                );
              }
              eventsByRequest[index].push(event);
            },
          })
        )
      );

      console.log('backend signed openai concurrent stream attestations=', JSON.stringify(attestations, null, 2));

      expect(attestations).toHaveLength(STREAM_REQUEST_COUNT);
      attestations.forEach((attestation) => {
        expect(attestation).toBeTruthy();
        expect(attestation.signatures?.length).toBeGreaterThan(0);
        expect(client.verifyAttestation(attestation)).toBe(true);
      });
      eventsByRequest.forEach(expectConcurrentStreamEvents);
      expect(new Set(eventsByRequest.map((events) => events[0]?.requestId)).size).toBe(STREAM_REQUEST_COUNT);
    } finally {
      await client.close();
    }
  });
});
