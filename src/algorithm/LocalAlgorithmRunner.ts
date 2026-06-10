import { getAttestation, getAttestationResult, init } from '../primus_zk';
import type { AlgorithmRunner, AlgorithmRunnerInitOptions, RunAttestationOptions } from './AlgorithmRunner';

export class LocalAlgorithmRunner implements AlgorithmRunner {
  init(options: AlgorithmRunnerInitOptions): Promise<string | boolean> {
    return init(options.backend);
  }

  async runAttestation(attParams: unknown, options: RunAttestationOptions): Promise<unknown> {
    const startResult = await getAttestation(attParams, {
      onStream: options.onResult,
    });
    if (startResult.retcode !== '0') {
      return {
        phase: 'start',
        result: startResult,
      };
    }
    const result = await getAttestationResult({
      timeout: options.timeout,
      pollIntervalMs: options.pollIntervalMs,
    });
    return {
      phase: 'result',
      result,
    };
  }
}
