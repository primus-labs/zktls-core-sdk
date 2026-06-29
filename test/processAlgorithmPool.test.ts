import { EventEmitter } from 'events';
import { ProcessAlgorithmPool } from '../src/algorithm/ProcessAlgorithmPool';

class FakeWorker extends EventEmitter {
  sent: unknown[] = [];
  killed = false;

  constructor(private readonly autoReady = true) {
    super();
  }

  send(message: unknown) {
    this.sent.push(message);
    const msg = message as { id: string; type: string };
    if (msg.type === 'init' && this.autoReady) {
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
      logLevel: 'error',
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

  it('passes the configured log level when initializing a worker', async () => {
    const workers: FakeWorker[] = [];
    const pool = new ProcessAlgorithmPool({
      backend: 'native',
      concurrency: 2,
      logLevel: 'info',
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    } as ConstructorParameters<typeof ProcessAlgorithmPool>[0]);

    const task = pool.runAttestation({ requestid: 'first' }, { timeout: 1000, pollIntervalMs: 10 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(workers[0].sent[0]).toEqual(
      expect.objectContaining({
        type: 'init',
        backend: 'native',
        logLevel: 'info',
      })
    );

    const attest = workers[0].sent.find((message) => (message as { type: string }).type === 'attest') as {
      id: string;
    };
    workers[0].emit('message', { id: attest.id, type: 'done', result: { retcode: '0' } });
    await task;
    await pool.close();
  });

  it('reuses an idle worker instead of starting another one', async () => {
    const workers: FakeWorker[] = [];
    const pool = new ProcessAlgorithmPool({
      backend: 'native',
      concurrency: 3,
      logLevel: 'error',
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

  it('rejects a task when the worker does not become ready before init timeout', async () => {
    jest.useFakeTimers();
    const workers: FakeWorker[] = [];
    const pool = new ProcessAlgorithmPool({
      backend: 'native',
      concurrency: 2,
      logLevel: 'error',
      workerInitTimeoutMs: 50,
      createWorker: () => {
        const worker = new FakeWorker(false);
        workers.push(worker);
        return worker;
      },
    } as ConstructorParameters<typeof ProcessAlgorithmPool>[0]);

    const task = pool.runAttestation({ requestid: 'first' }, { timeout: 1000, pollIntervalMs: 10 });
    const taskExpectation = expect(task).rejects.toThrow('Algorithm worker init timed out after 50ms');

    expect(workers).toHaveLength(1);
    expect(workers[0].sent[0]).toEqual(expect.objectContaining({ type: 'init' }));

    await jest.advanceTimersByTimeAsync(50);
    await taskExpectation;
    expect(workers[0].killed).toBe(true);

    await pool.close();
    jest.useRealTimers();
  });
});
