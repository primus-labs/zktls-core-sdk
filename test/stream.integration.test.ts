import { PrimusCoreTLS } from '../src/index';
import type { AttestationProgressEvent } from '../src/index.d';

const STREAM_TIMEOUT_MS = 10 * 60 * 1000;

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name} must be set in .env`);
  }
  return value.trim();
};

const buildTestApiStreamAttRequest = (client: PrimusCoreTLS) => {
  const model = "gpt-5.4-mini";

  const attRequest = client.generateRequestParams(
    {
      url: "https://api-dev.padolabs.org/test-body/body?rspSize=128b&stream=true",
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: 'Reply with exactly: zktls-stream-ok',
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

describe('real test API stream attestation', () => {
  jest.setTimeout(STREAM_TIMEOUT_MS);

  const appId = process.env.ZKTLS_APP_ID;
  const appSecret = process.env.ZKTLS_APP_SECRET;

  beforeAll(() => {
    requireEnv('ZKTLS_APP_ID');
    requireEnv('ZKTLS_APP_SECRET');
  });

  it('emits stream-data from the test streaming API and resolves the final proof', async () => {
    const client = new PrimusCoreTLS();
    await client.init(appId!, appSecret!, {
      backend: 'auto',
      concurrency: 1,
    });

    const events: AttestationProgressEvent[] = [];
    try {
      const attestation = await client.startAttestation(buildTestApiStreamAttRequest(client), {
        timeout: STREAM_TIMEOUT_MS,
        stream: true,
        onProgress: (event) => {
          console.log('test api stream onProgress event=', stringifyStreamLog(event));
          if (event.type === 'stream-data') {
            console.log('test api stream onProgress string=', Buffer.from(event.data as Uint8Array).toString('utf8'));
          }
          events.push(event);
        },
      });

      console.log('test api stream attestation=', JSON.stringify(attestation, null, 2));
      expectStreamEvents(events);
      expect(attestation).toBeTruthy();
      expect(attestation.signatures?.length).toBeGreaterThan(0);
      expect(client.verifyAttestation(attestation)).toBe(true);
    } finally {
      // console.log('test api stream progress events=', stringifyStreamLog(events));
      await client.close();
    }
  });
});
