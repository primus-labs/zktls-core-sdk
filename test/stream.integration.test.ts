import { PrimusCoreTLS } from '../src/index';
import type { AttestationProgressEvent } from '../src/index.d';

const STREAM_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
const shouldRunStreamIntegration = process.env.ZKTLS_STREAM_INTEGRATION === 'true';
const describeStreamIntegration = shouldRunStreamIntegration ? describe : describe.skip;

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name} must be set in .env when ZKTLS_STREAM_INTEGRATION=true`);
  }
  return value.trim();
};

const buildOpenAIStreamAttRequest = (client: PrimusCoreTLS) => {
  const openAIUrl = requireEnv('OPENAI_API_URL');
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
            content: 'Reply with exactly: zktls-stream-ok',
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

const expectStreamEvents = (events: AttestationProgressEvent[]) => {
  expect(events.some((event) => event.type === 'stream-data')).toBe(true);
  expect(events.some((event) => event.type === 'proof-ready')).toBe(true);
};

describeStreamIntegration('real OpenAI stream attestation', () => {
  jest.setTimeout(STREAM_TIMEOUT_MS);

  const appId = process.env.ZKTLS_APP_ID;
  const appSecret = process.env.ZKTLS_APP_SECRET;

  beforeAll(() => {
    requireEnv('ZKTLS_APP_ID');
    requireEnv('ZKTLS_APP_SECRET');
    requireEnv('OPENAI_API_KEY');
    requireEnv('OPENAI_API_URL');
  });

  it('emits stream-data from OpenAI streaming API and resolves the final proof', async () => {
    const client = new PrimusCoreTLS();
    await client.init(appId!, appSecret!, {
      backend: 'auto',
      concurrency: 1,
    });

    const events: AttestationProgressEvent[] = [];
    try {
      const attestation = await client.startAttestation(buildOpenAIStreamAttRequest(client), {
        timeout: STREAM_TIMEOUT_MS,
        stream: true,
        onProgress: (event) => {
          console.log('openai stream onProgress event=', stringifyStreamLog(event));
          if (event.type === 'stream-data') {
            console.log('openai stream onProgress string=', Buffer.from(event.data as Uint8Array).toString('utf8'));
          }
          events.push(event);
        },
      });

      console.log('openai stream attestation=', JSON.stringify(attestation, null, 2));
      expectStreamEvents(events);
      expect(attestation).toBeTruthy();
      expect(attestation.signatures?.length).toBeGreaterThan(0);
      expect(client.verifyAttestation(attestation)).toBe(true);
    } finally {
      // console.log('openai stream progress events=', stringifyStreamLog(events));
      await client.close();
    }
  });
});
