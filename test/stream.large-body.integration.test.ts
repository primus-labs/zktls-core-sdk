import { PrimusCoreTLS } from '../src/index';
import type { AttestationProgressEvent } from '../src/index.d';

const STREAM_TIMEOUT_MS = 20 * 60 * 1000;
const OFFLINE_TIMEOUT_MS = 10 * 60 * 1000;
const RUN_LARGE_BODY_TEST = process.env.ZKTLS_RUN_LARGE_BODY_TEST === 'true';
const REQUEST_BODY_SIZE_KIB = Number(process.env.ZKTLS_TEST_BODY_SIZE_KIB ?? 1024);

if (RUN_LARGE_BODY_TEST && (!Number.isFinite(REQUEST_BODY_SIZE_KIB) || REQUEST_BODY_SIZE_KIB <= 0)) {
  throw new Error('ZKTLS_TEST_BODY_SIZE_KIB must be a number greater than 0');
}

const REQUEST_BODY_SIZE_BYTES = Math.floor(REQUEST_BODY_SIZE_KIB * 1024);

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name} must be set in .env`);
  }
  return value.trim();
};

const buildLargeBodyTestApiStreamAttRequest = (client: PrimusCoreTLS, payloadSize: number) => {
  const body = JSON.stringify({
    model: 'gpt-5.4-mini',
    messages: [
      {
        role: 'user',
        content: 'Reply with exactly: zktls-stream-large-body-ok',
      },
    ],
    payload: 'x'.repeat(payloadSize),
    stream: true,
    temperature: 0,
  });

  const attRequest = client.generateRequestParams(
    {
      url: 'https://api-dev.padolabs.org/test-body/body?rspSize=1k&stream=true',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
      },
      body,
    },
    [
      {
        keyName: 'test_api_stream_large_body',
        parseType: 'json',
        parsePath: '$',
      },
    ]
  );

  attRequest.setAttMode({
    algorithmType: 'proxytls',
    resultType: 'plain',
  });

  return { attRequest, body };
};

const expectStreamEvents = (events: AttestationProgressEvent[]) => {
  expect(events.some((event) => event.type === 'stream-data')).toBe(true);
  expect(events.some((event) => event.type === 'proof-ready')).toBe(true);
};

const stringifyStreamLog = (value: unknown) =>
  JSON.stringify(value, (_key, item) => {
    if (item instanceof Uint8Array) {
      return Buffer.from(item).toString('utf8');
    }
    return item;
  });

const describeLargeBodyTest = RUN_LARGE_BODY_TEST ? describe : describe.skip;

describeLargeBodyTest(`${REQUEST_BODY_SIZE_KIB} KiB request body stream attestation`, () => {
  jest.setTimeout(STREAM_TIMEOUT_MS + 60_000);

  const appId = process.env.ZKTLS_APP_ID;
  const appSecret = process.env.ZKTLS_APP_SECRET;

  beforeAll(() => {
    requireEnv('ZKTLS_APP_ID');
    requireEnv('ZKTLS_APP_SECRET');
  });

  it('emits stream data and resolves a proof for the configured request body size', async () => {
    const client = new PrimusCoreTLS();
    await client.init(appId!, appSecret!, {
      backend: 'auto',
      concurrency: 1,
    });

    const { attRequest, body } = buildLargeBodyTestApiStreamAttRequest(client, REQUEST_BODY_SIZE_BYTES);
    expect(Buffer.byteLength(JSON.parse(body).payload, 'utf8')).toBe(REQUEST_BODY_SIZE_BYTES);

    const events: AttestationProgressEvent[] = [];
    try {
      const attestation = await client.startAttestation(attRequest, {
        timeout: STREAM_TIMEOUT_MS,
        stream: true,
        proveLargeData: true,
        offlineTimeout: OFFLINE_TIMEOUT_MS,
        onProgress: (event) => {
          console.log('large body stream onProgress event=', stringifyStreamLog(event));
          events.push(event);
        },
      });

      expectStreamEvents(events);
      expect(attestation).toBeTruthy();
      expect(attestation.signatures?.length).toBeGreaterThan(0);
      expect(client.verifyAttestation(attestation)).toBe(true);
    } finally {
      await client.close();
    }
  });
});
