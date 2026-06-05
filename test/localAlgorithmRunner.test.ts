import { LocalAlgorithmRunner } from '../src/algorithm/LocalAlgorithmRunner';
import { getAttestation, getAttestationResult } from '../src/primus_zk';

jest.mock('../src/primus_zk', () => ({
  init: jest.fn().mockResolvedValue(true),
  getAttestation: jest.fn(),
  getAttestationResult: jest.fn(),
}));

describe('LocalAlgorithmRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAttestationResult as jest.Mock).mockResolvedValue({ retcode: '0' });
  });

  it('routes getAttestation stream callbacks through onResult', async () => {
    const onResult = jest.fn();
    const streamResult = {
      retcode: '1',
      status: 'streaming',
      requestid: 'request-1',
      content: {
        data: { chunk: 'child-stream' },
      },
    };

    (getAttestation as jest.Mock).mockImplementation(async (_params, options) => {
      await options.onStream(streamResult);
      return { retcode: '0' };
    });

    const runner = new LocalAlgorithmRunner();
    await runner.runAttestation(
      { requestid: 'request-1', stream: true },
      {
        timeout: 1000,
        pollIntervalMs: 10,
        onResult,
      }
    );

    expect(onResult).toHaveBeenCalledWith(streamResult);
  });
});
