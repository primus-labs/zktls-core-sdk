import { PrimusCoreTLS } from '../src/index';
import type { AttestationProgressEvent } from '../src/index.d';

const STREAM_TIMEOUT_MS = 10 * 60 * 1000;
const STREAM_CONCURRENCY = 2;
const STREAM_REQUEST_COUNT = 2;
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
            content: `Reply with exactly: zktls-stream-concurrent-${index}`,
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

const expectConcurrentStreamEvents = (events: AttestationProgressEvent[], requestId?: string) => {
  expect(events.some((event) => event.type === 'stream-data')).toBe(true);
  expect(events.some((event) => event.type === 'proof-ready')).toBe(true);
  if (requestId) {
    expect(events.every((event) => event.requestId === requestId)).toBe(true);
  }
};

describeStreamIntegration('real concurrent OpenAI stream attestation', () => {
  jest.setTimeout(STREAM_TIMEOUT_MS * Math.max(2, STREAM_REQUEST_COUNT));

  const appId = process.env.ZKTLS_APP_ID;
  const appSecret = process.env.ZKTLS_APP_SECRET;

  beforeAll(() => {
    requireEnv('ZKTLS_APP_ID');
    requireEnv('ZKTLS_APP_SECRET');
    requireEnv('OPENAI_API_KEY');
    requireOpenAIStreamUrl();
  });

  it(`routes ${STREAM_REQUEST_COUNT} concurrent stream attestations through their own onProgress callbacks`, async () => {
    const client = new PrimusCoreTLS();
    await client.init(appId!, appSecret!, {
      backend: 'auto',
      concurrency: STREAM_CONCURRENCY,
    });

    const eventsByRequest = Array.from({ length: STREAM_REQUEST_COUNT }, () => [] as AttestationProgressEvent[]);
    const attRequests = Array.from({ length: STREAM_REQUEST_COUNT }, (_, index) =>
      buildOpenAIStreamAttRequest(client, index)
    );

    try {
      const attestations = await Promise.all(
        attRequests.map((attRequest, index) =>
          client.startAttestation(attRequest, {
            timeout: STREAM_TIMEOUT_MS,
            stream: true,
            onProgress: (event) => {
              console.log(`openai concurrent stream ${index} onProgress event=`, stringifyStreamLog(event));
              if (event.type === 'stream-data') {
                console.log(
                  `openai concurrent stream ${index} onProgress string=`,
                  Buffer.from(event.data as Uint8Array).toString('utf8')
                );
              }
              eventsByRequest[index].push(event);
            },
          })
        )
      );

      // console.log(
      //   'openai concurrent stream progress events=',
      //   stringifyStreamLog(
      //     eventsByRequest.map((events, index) => ({
      //       index,
      //       requestId: attRequests[index].requestid,
      //       events,
      //     }))
      //   )
      // );
      console.log('openai concurrent stream attestations=', JSON.stringify(attestations, null, 2));

      expect(attestations).toHaveLength(STREAM_REQUEST_COUNT);
      attestations.forEach((attestation) => {
        expect(attestation).toBeTruthy();
        expect(attestation.signatures?.length).toBeGreaterThan(0);
        expect(client.verifyAttestation(attestation)).toBe(true);
      });
      eventsByRequest.forEach((events, index) => {
        expectConcurrentStreamEvents(events, attRequests[index].requestid);
      });
    } finally {
      await client.close();
    }
  });
});
