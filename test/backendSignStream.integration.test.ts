import http, { IncomingMessage, Server } from 'http';

import { PrimusCoreTLS } from '../src/index';
import type { AttRequest } from '../src/classes/AttRequest';
import type { AttestationProgressEvent } from '../src/index.d';

const STREAM_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_API_STREAM_URL = 'https://api-dev.padolabs.org/test-body/body?rspSize=128b&stream=true';

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name} must be set in .env`);
  }
  return value.trim();
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

const buildTestApiStreamAttRequest = (client: PrimusCoreTLS) => {
  const model = 'gpt-5.4-mini';

  const attRequest = client.generateRequestParams(
    {
      url: TEST_API_STREAM_URL,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: 'Reply with exactly: zktls-backend-sign-stream-ok',
          },
        ],
        stream: true,
        temperature: 0,
      }),
    },
    [
      {
        keyName: 'test_api_stream',
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

const expectStreamEvents = (events: AttestationProgressEvent[]) => {
  expect(events.some((event) => event.type === 'stream-data')).toBe(true);
  expect(events.some((event) => event.type === 'proof-ready')).toBe(true);
};

describe('backend signed test API stream attestation', () => {
  jest.setTimeout(STREAM_TIMEOUT_MS + 60_000);

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

  it('emits stream-data and resolves proof when the request is signed by a backend', async () => {
    const client = new PrimusCoreTLS();
    await client.init(appId!);

    const events: AttestationProgressEvent[] = [];
    try {
      const attRequest = buildTestApiStreamAttRequest(client);
      const signedRequestStr = await getBackendSignedRequest(attRequest);
      const attestation = await client.startAttestation(signedRequestStr, {
        timeout: STREAM_TIMEOUT_MS,
        stream: true,
        onProgress: (event) => {
          console.log('backend signed test api stream onProgress event=', stringifyStreamLog(event));
          if (event.type === 'stream-data') {
            console.log(
              'backend signed test api stream onProgress string=',
              Buffer.from(event.data as Uint8Array).toString('utf8')
            );
          }
          events.push(event);
        },
      });

      console.log('backend signed test api stream attestation=', JSON.stringify(attestation, null, 2));
      expectStreamEvents(events);
      expect(attestation).toBeTruthy();
      expect(attestation.signatures?.length).toBeGreaterThan(0);
      expect(client.verifyAttestation(attestation)).toBe(true);
    } finally {
      await client.close();
    }
  });
});
