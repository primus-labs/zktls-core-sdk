import { ethers } from 'ethers';
import { PADO_ADDRESS } from '../src/config/env';
import { PrimusCoreTLS } from '../src/index';
import type { Attestation } from '../src/index.d';

jest.mock('../src/utils', () => ({
  ...jest.requireActual('../src/utils'),
  encodeAttestation: jest.fn().mockReturnValue(`0x${'00'.repeat(32)}`),
}));

jest.mock('../src/classes/AlgorithmUrls', () => ({
  AlgorithmUrls: jest.fn().mockImplementation(() => ({
    primusMpcUrl: 'wss://example.com/algorithm',
    primusProxyUrl: 'wss://example.com/algorithm-proxy',
    proxyUrl: 'wss://example.com/algoproxy',
    fetchNodes: jest.fn().mockResolvedValue(true),
  })),
}));

describe('environment-specific attestation verification', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts an attestation signed by the configured environment signer', () => {
    jest.spyOn(ethers.utils, 'recoverAddress').mockReturnValue(PADO_ADDRESS);

    const client = new PrimusCoreTLS();
    const attestation = { signatures: ['0xtest-signature'] } as Attestation;

    expect(client.verifyAttestation(attestation)).toBe(true);
  });
});
