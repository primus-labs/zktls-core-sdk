import { EventEmitter } from 'events';
import { ProcessAlgorithmPool } from '../src/algorithm/ProcessAlgorithmPool';

class FakeWorker extends EventEmitter {
  sent: unknown[] = [];
  killed = false;

  send(message: unknown) {
    this.sent.push(message);
    const msg = message as { id: string; type: string };
    if (msg.type === 'init') {
      setImmediate(() => this.emit('message', { id: msg.id, type: 'ready', result: true }));
    }
    return true;
  }

  kill() {
    this.killed = true;
    this.emit('exit', 0, null);
    return true;
  }
}

describe('ProcessAlgorithmPool', () => {
  it('lazily starts workers up to concurrency and queues additional tasks', async () => {
    const workers: FakeWorker[] = [];
    const pool = new ProcessAlgorithmPool({
      backend: 'native',
      concurrency: 2,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    const first = pool.runAttestation({ requestid: 'first' }, { timeout: 1000, pollIntervalMs: 10 });
    const second = pool.runAttestation({ requestid: 'second' }, { timeout: 1000, pollIntervalMs: 10 });
    const third = pool.runAttestation({ requestid: 'third' }, { timeout: 1000, pollIntervalMs: 10 });

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(workers).toHaveLength(2);
    expect(workers[0].sent.some((message) => (message as { type: string }).type === 'attest')).toBe(true);
    expect(workers[1].sent.some((message) => (message as { type: string }).type === 'attest')).toBe(true);

    const firstAttest = workers[0].sent.find((message) => (message as { type: string }).type === 'attest') as {
      id: string;
    };
    workers[0].emit('message', { id: firstAttest.id, type: 'done', result: { retcode: '0', worker: 1 } });
    await first;
    await new Promise((resolve) => setImmediate(resolve));

    const workerOneAttests = workers[0].sent.filter(
      (message) => (message as { type: string }).type === 'attest'
    );
    expect(workerOneAttests).toHaveLength(2);

    const secondAttest = workers[1].sent.find((message) => (message as { type: string }).type === 'attest') as {
      id: string;
    };
    const thirdAttest = workers[0].sent
      .filter((message) => (message as { type: string }).type === 'attest')
      .at(-1) as { id: string };
    workers[1].emit('message', { id: secondAttest.id, type: 'done', result: { retcode: '0', worker: 2 } });
    workers[0].emit('message', { id: thirdAttest.id, type: 'done', result: { retcode: '0', worker: 1 } });
    await Promise.all([second, third]);
    await pool.close();
  });

  it('reuses an idle worker instead of starting another one', async () => {
    const workers: FakeWorker[] = [];
    const pool = new ProcessAlgorithmPool({
      backend: 'native',
      concurrency: 3,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    const first = pool.runAttestation({ requestid: 'first' }, { timeout: 1000, pollIntervalMs: 10 });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const firstAttest = workers[0].sent.find((message) => (message as { type: string }).type === 'attest') as {
      id: string;
    };
    workers[0].emit('message', { id: firstAttest.id, type: 'done', result: { retcode: '0' } });
    await first;

    const second = pool.runAttestation({ requestid: 'second' }, { timeout: 1000, pollIntervalMs: 10 });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(workers).toHaveLength(1);
    const secondAttest = workers[0].sent
      .filter((message) => (message as { type: string }).type === 'attest')
      .at(-1) as { id: string };
    workers[0].emit('message', { id: secondAttest.id, type: 'done', result: { retcode: '0' } });
    await second;
    await pool.close();
  });
});
