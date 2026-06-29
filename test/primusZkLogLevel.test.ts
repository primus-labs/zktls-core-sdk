const callAlgorithm = jest.fn().mockResolvedValue('{"retcode":"0"}');

jest.mock('../src/algorithm/client_plugin.js', () => {
  const module: Record<string, unknown> = {
    cwrap: jest.fn(() => callAlgorithm),
  };
  Object.defineProperty(module, 'onRuntimeInitialized', {
    set(callback: () => void) {
      setImmediate(callback);
    },
  });
  return module;
});

import { init } from '../src/primus_zk';

describe('primus_zk log level', () => {
  beforeEach(() => {
    callAlgorithm.mockClear();
  });

  it('sets the configured log level before initializing the algorithm', async () => {
    await (init as (backend: 'wasm', logLevel: string) => Promise<string>)('wasm', 'debug');

    expect(JSON.parse(callAlgorithm.mock.calls[0][0])).toMatchObject({
      method: 'setLogConfig',
      params: { logLevel: 'debug', logLength: '2048' },
    });
    expect(JSON.parse(callAlgorithm.mock.calls[1][0])).toMatchObject({ method: 'init' });
  });
});
