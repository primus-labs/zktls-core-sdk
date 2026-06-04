import { LocalAlgorithmRunner } from './LocalAlgorithmRunner';
import { serializeError, type ParentToChildMessage } from './AlgorithmRunner';

let runner: LocalAlgorithmRunner | undefined;

function send(message: unknown): void {
  if (process.send) {
    process.send(message);
  }
}

process.on('message', async (message: ParentToChildMessage) => {
  try {
    if (message.type === 'init') {
      runner = new LocalAlgorithmRunner();
      const result = await runner.init({ backend: message.backend });
      send({ id: message.id, type: 'ready', result });
      return;
    }

    if (message.type === 'attest') {
      if (!runner) {
        throw new Error('Algorithm worker is not initialized');
      }
      const result = await runner.runAttestation(message.params, {
        timeout: message.timeout,
        pollIntervalMs: message.pollIntervalMs,
        onResult: (progress) => {
          send({ id: message.id, type: 'progress', result: progress });
        },
      });
      send({ id: message.id, type: 'done', result });
      return;
    }

    if (message.type === 'close') {
      process.exit(0);
    }
  } catch (error) {
    send({ id: message.id, type: 'error', error: serializeError(error) });
  }
});
