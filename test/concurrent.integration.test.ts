import { PrimusCoreTLS } from '../src/index';

const ATTESTATION_TIMEOUT_MS = 10 * 60 * 1000;
const CONCURRENCY = 3;
const REQUEST_COUNT = 4;

const buildAttRequest = (client: PrimusCoreTLS, index: number) => {
  const request = [
    {
      url: `https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=BTC-USD&case=${index}`,
      method: 'GET',
      header: {},
      body: '',
    },
    {
      url: `https://www.okx.com/api/v5/public/time?case=${index}`,
      method: 'GET',
      header: {},
      body: '',
    },
  ];

  const responseResolves = [
    [
      {
        keyName: 'instType',
        parseType: 'json',
        parsePath: '$.data[0].instType',
      },
    ],
    [
      {
        keyName: 'time',
        parseType: 'json',
        parsePath: '$.data[0].ts',
      },
    ],
  ];

  const attRequest = client.generateRequestParams(request, responseResolves);
  attRequest.setAttMode({
    algorithmType: 'proxytls',
    resultType: 'plain',
  });

  return attRequest;
};

describe('real concurrent attestation', () => {
  jest.setTimeout(ATTESTATION_TIMEOUT_MS * 2);

  const appId = process.env.ZKTLS_APP_ID;
  const appSecret = process.env.ZKTLS_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('ZKTLS_APP_ID and ZKTLS_APP_SECRET must be set in .env');
  }

  it(`runs ${REQUEST_COUNT} attestations with concurrency ${CONCURRENCY} without stream mode`, async () => {
    const client = new PrimusCoreTLS();
    await client.init(appId, appSecret, {
      backend: 'auto',
      concurrency: CONCURRENCY,
    });

    try {
      const attestations = await Promise.all(
        Array.from({ length: REQUEST_COUNT }, (_, index) => {
          const attRequest = buildAttRequest(client, index);
          return client.startAttestation(attRequest, ATTESTATION_TIMEOUT_MS);
        })
      );

      console.log('concurrent attestations=', attestations);
      expect(attestations).toHaveLength(REQUEST_COUNT);

      for (const attestation of attestations) {
        expect(attestation).toBeTruthy();
        expect(attestation.signatures?.length).toBeGreaterThan(0);
        expect(client.verifyAttestation(attestation)).toBe(true);
      }
    } finally {
      await client.close();
    }
  });
});
