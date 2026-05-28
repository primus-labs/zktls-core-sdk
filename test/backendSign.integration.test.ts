import http, { IncomingMessage, Server } from 'http';

import { PrimusCoreTLS } from '../src/index';
import type { AttRequest } from '../src/classes/AttRequest';

const ATTESTATION_TIMEOUT_MS = 10 * 60 * 1000;
// const runIntegration = process.env.RUN_BACKEND_SIGN_INTEGRATION === 'true';
const runIntegration = true;
const describeIntegration = runIntegration ? describe : describe.skip;

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
        throw new Error('Failed to get backend sign server address');
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

const buildDemoAttRequest = (client: PrimusCoreTLS) => {
  const request = [
    {
      url: 'https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=BTC-USD',
      method: 'GET',
      header: {},
      body: '',
    },
    {
      url: 'https://www.okx.com/api/v5/public/time',
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

describeIntegration('backend sign integration flow', () => {
  jest.setTimeout(ATTESTATION_TIMEOUT_MS + 60_000);

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
    if (!appId || !appSecret) {
      throw new Error('ZKTLS_APP_ID and ZKTLS_APP_SECRET must be set in .env');
    }

    server = http.createServer(async (req, res) => {
      try {
        const signParams = await readBody(req);
        const signer = new PrimusCoreTLS();
        await signer.init(appId, appSecret);
        const signResult = await signer.sign(signParams);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          rc: 0,
          result: {
            signResult,
          },
        }));
      } catch (error: unknown) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          rc: -1,
          msg: error instanceof Error ? error.message : 'Sign failed',
        }));
      }
    });
    signUrl = await listen(server);
  });

  afterAll(async () => {
    if (server) {
      await close(server);
    }
  });

  it('starts a real attestation with a backend signed request string', async () => {
    if (!appId) {
      throw new Error('ZKTLS_APP_ID must be set in .env');
    }

    const client = new PrimusCoreTLS();
    await client.init(appId);

    const attRequest = buildDemoAttRequest(client);
    const signedRequestStr = await getBackendSignedRequest(attRequest);
    const attestation = await client.startAttestation(signedRequestStr, ATTESTATION_TIMEOUT_MS);
    console.log('attestation=', attestation);
    console.log('verifyAttestationRes=', client.verifyAttestation(attestation));
  });
});
