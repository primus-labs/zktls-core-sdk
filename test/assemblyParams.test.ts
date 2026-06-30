import { assemblyParams } from '../src/assembly_params';
import { AlgorithmUrls } from '../src/classes/AlgorithmUrls';
import type { AttConditionExpansion, SignedAttRequest } from '../src/index.d';

const algorithmUrls = new AlgorithmUrls();
algorithmUrls.primusMpcUrl = 'wss://example.com/mpc';
algorithmUrls.primusProxyUrl = 'wss://example.com/proxy';
algorithmUrls.proxyUrl = 'wss://example.com/algoproxy';

const baseSignedAttRequest = {
  appSignature: '0xsig',
  attRequest: {
    appId: 'app-id',
    userAddress: '0x0000000000000000000000000000000000000000',
    timestamp: 1,
    requestid: 'request-id',
    request: {
      url: 'https://example.com/api',
      method: 'GET',
      header: {},
      body: '',
    },
    responseResolves: [
      {
        keyName: 'address',
        parsePath: '$.address',
      },
    ],
  },
} satisfies SignedAttRequest;

const options = {
  proveLargeData: false,
  offlineTimeout: 60000,
};

describe('assemblyParams attConditions', () => {
  it('maps STRCASEEQ and STRCASENEQ to FIELD_RANGE conditions', () => {
    const signedAttRequest: SignedAttRequest = {
      ...baseSignedAttRequest,
      attRequest: {
        ...baseSignedAttRequest.attRequest,
        responseResolves: [
          { keyName: 'address', parsePath: '$.address' },
          { keyName: 'name', parsePath: '$.name' },
        ],
        attConditions: [
          [
            { field: 'address', op: 'STRCASEEQ', value: '0xabc' },
            { field: 'name', op: 'STRCASENEQ', value: 'alice' },
          ],
        ],
      },
    };

    const params = assemblyParams(signedAttRequest, algorithmUrls, options);

    expect(params.responses[0].conditions.subconditions).toEqual([
      {
        field: '$.address',
        reveal_id: 'address',
        op: 'STRCASEEQ',
        type: 'FIELD_RANGE',
        value: '0xabc',
      },
      {
        field: '$.name',
        reveal_id: 'name',
        op: 'STRCASENEQ',
        type: 'FIELD_RANGE',
        value: 'alice',
      },
    ]);
  });

  it('passes MATCH_ONE expansion conditions as algorithm subconditions', () => {
    const matchOneCondition: AttConditionExpansion = {
      type: 'CONDITION_EXPANSION',
      op: 'MATCH_ONE',
      key: 'rows',
      field: '$.data.rows[*]+',
      value: [
        {
          type: 'FIELD_RANGE',
          op: 'STRCASEEQ',
          field: '+.address',
          value: '0xabc',
        },
      ],
    };
    const signedAttRequest: SignedAttRequest = {
      ...baseSignedAttRequest,
      attRequest: {
        ...baseSignedAttRequest.attRequest,
        responseResolves: [
          {
            keyName: 'rows',
            parsePath: '$.data.rows',
          },
        ],
        attConditions: [[matchOneCondition]],
      },
    };

    const params = assemblyParams(signedAttRequest, algorithmUrls, options);

    expect(params.responses[0].conditions.subconditions).toEqual([
      {
        type: 'CONDITION_EXPANSION',
        op: 'MATCH_ONE',
        field: '$.data.rows[*]+',
        subconditions: matchOneCondition.value,
      },
    ]);
  });
});
