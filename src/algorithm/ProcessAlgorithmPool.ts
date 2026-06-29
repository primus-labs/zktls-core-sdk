import { fork } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AlgorithmBackend, AlgorithmLogLevel } from '../primus_zk';
import {
  deserializeError,
  type AlgorithmRunner,
  type ChildToParentMessage,
  type ParentToChildMessage,
  type RunAttestationOptions,
  type WorkerProcess,
} from './AlgorithmRunner';

type PoolTask = {
  id: string;
  params: unknown;
  options: RunAttestationOptions;
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
};

type PoolWorker = {
  process: WorkerProcess;
  busy: boolean;
  initialized: boolean;
  initId?: string;
  currentTask?: PoolTask;
};

const DEFAULT_WORKER_INIT_TIMEOUT_MS = 15000;

type ProcessAlgorithmPoolOptions = {
  backend: AlgorithmBackend;
  concurrency: number;
  logLevel: AlgorithmLogLevel;
  logLength: number;
  workerPath?: string;
  createWorker?: () => WorkerProcess;
  workerInitTimeoutMs?: number;
};

export class ProcessAlgorithmPool implements AlgorithmRunner {
  private readonly backend: AlgorithmBackend;
  private readonly concurrency: number;
  private readonly logLevel: AlgorithmLogLevel;
  private readonly logLength: number;
  private readonly workerPath: string;
  private readonly createWorker?: () => WorkerProcess;
  private readonly workerInitTimeoutMs: number;
  private readonly workers: PoolWorker[] = [];
  private readonly pending: PoolTask[] = [];
  private readonly initWaiters = new Map<string, { resolve: () => void; reject: (error: unknown) => void }>();
  private taskSeq = 0;

  constructor(options: ProcessAlgorithmPoolOptions) {
    this.backend = options.backend;
    this.concurrency = Math.max(2, Math.floor(options.concurrency));
    this.logLevel = options.logLevel;
    this.logLength = options.logLength;
    this.workerPath = options.workerPath || resolveDefaultWorkerPath();
    this.createWorker = options.createWorker;
    this.workerInitTimeoutMs = Math.max(1, Math.floor(options.workerInitTimeoutMs ?? DEFAULT_WORKER_INIT_TIMEOUT_MS));
  }

  init(_options?: unknown): Promise<string | boolean> {
    void _options;
    return Promise.resolve(true);
  }

  runAttestation(attParams: unknown, options: RunAttestationOptions): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.push({
        id: this.nextId('task'),
        params: attParams,
        options,
        resolve,
        reject,
      });
      void this.drain();
    });
  }

  close(): Promise<void> {
    const workers = [...this.workers];
    this.workers.length = 0;
    this.pending.splice(0).forEach((task) => task.reject(new Error('ProcessAlgorithmPool closed')));
    for (const worker of workers) {
      worker.process.kill();
    }
    return Promise.resolve();
  }

  private async drain(): Promise<void> {
    while (this.pending.length > 0) {
      const idleWorker = this.workers.find((worker) => worker.initialized && !worker.busy);
      if (idleWorker) {
        const task = this.pending.shift();
        if (task) {
          this.assign(idleWorker, task);
        }
        continue;
      }

      if (this.workers.length < this.concurrency) {
        const task = this.pending.shift();
        if (!task) {
          return;
        }
        const worker = this.createPoolWorker();
        this.workers.push(worker);
        try {
          await this.initializeWorker(worker);
          this.assign(worker, task);
        } catch (error) {
          this.removeWorker(worker);
          task.reject(error);
        }
        continue;
      }

      return;
    }
  }

  private createPoolWorker(): PoolWorker {
    const child = this.createWorker ? this.createWorker() : fork(this.workerPath);
    const worker: PoolWorker = {
      process: child,
      busy: false,
      initialized: false,
    };
    child.on('message', (message: ChildToParentMessage) => this.handleMessage(worker, message));
    child.on('exit', (code: number | null, signal: string | null) => this.handleExit(worker, code, signal));
    child.on('error', (error: Error) => this.handleExit(worker, null, null, error));
    return worker;
  }

  private initializeWorker(worker: PoolWorker): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.nextId('init');
      const timeoutId = setTimeout(() => {
        if (!this.initWaiters.has(id)) {
          return;
        }
        this.initWaiters.delete(id);
        worker.initId = undefined;
        this.removeWorker(worker);
        worker.process.kill();
        reject(new Error(`Algorithm worker init timed out after ${this.workerInitTimeoutMs}ms`));
      }, this.workerInitTimeoutMs);
      worker.initId = id;
      this.initWaiters.set(id, {
        resolve: () => {
          clearTimeout(timeoutId);
          resolve();
        },
        reject: (error: unknown) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });
      this.send(worker, {
        id,
        type: 'init',
        backend: this.backend,
        logLevel: this.logLevel,
        logLength: this.logLength,
      });
    });
  }

  private assign(worker: PoolWorker, task: PoolTask): void {
    worker.busy = true;
    worker.currentTask = task;
    this.send(worker, {
      id: task.id,
      type: 'attest',
      params: task.params,
      timeout: task.options.timeout,
      pollIntervalMs: task.options.pollIntervalMs,
    });
  }

  private handleMessage(worker: PoolWorker, message: ChildToParentMessage): void {
    if (message.type === 'ready') {
      worker.initialized = true;
      worker.initId = undefined;
      const waiter = this.initWaiters.get(message.id);
      if (waiter) {
        this.initWaiters.delete(message.id);
        waiter.resolve();
      }
      return;
    }

    if (message.type === 'progress') {
      const task = worker.currentTask;
      if (!task || task.id !== message.id || !task.options.onResult) {
        return;
      }
      Promise.resolve(task.options.onResult(message.result)).catch((error) => {
        task.reject(error);
        this.restartWorker(worker);
      });
      return;
    }

    if (message.type === 'done') {
      const task = worker.currentTask;
      if (task && task.id === message.id) {
        this.finishWorkerTask(worker);
        task.resolve(message.result);
        void this.drain();
      }
      return;
    }

    const initWaiter = this.initWaiters.get(message.id);
    if (initWaiter) {
      this.initWaiters.delete(message.id);
      initWaiter.reject(deserializeError(message.error));
      return;
    }

    const task = worker.currentTask;
    if (task && task.id === message.id) {
      task.reject(deserializeError(message.error));
      this.restartWorker(worker);
    }
  }

  private handleExit(
    worker: PoolWorker,
    code: number | null,
    signal: string | null,
    error?: Error
  ): void {
    this.removeWorker(worker);
    if (worker.initId) {
      const waiter = this.initWaiters.get(worker.initId);
      if (waiter) {
        this.initWaiters.delete(worker.initId);
        waiter.reject(error || new Error(`Algorithm worker exited during init: code=${code ?? ''} signal=${signal ?? ''}`));
      }
      worker.initId = undefined;
    }
    if (worker.currentTask) {
      worker.currentTask.reject(
        error || new Error(`Algorithm worker exited before task completed: code=${code ?? ''} signal=${signal ?? ''}`)
      );
    }
    void this.drain();
  }

  private finishWorkerTask(worker: PoolWorker): void {
    worker.busy = false;
    worker.currentTask = undefined;
  }

  private restartWorker(worker: PoolWorker): void {
    const currentTask = worker.currentTask;
    if (currentTask) {
      worker.currentTask = undefined;
      worker.busy = false;
    }
    this.removeWorker(worker);
    worker.process.kill();
    void this.drain();
  }

  private removeWorker(worker: PoolWorker): void {
    const index = this.workers.indexOf(worker);
    if (index !== -1) {
      this.workers.splice(index, 1);
    }
  }

  private send(worker: PoolWorker, message: ParentToChildMessage): void {
    worker.process.send(message);
  }

  private nextId(prefix: string): string {
    this.taskSeq += 1;
    return `${prefix}-${Date.now()}-${this.taskSeq}`;
  }
}

function resolveDefaultWorkerPath(): string {
  const localWorkerPath = path.join(__dirname, 'process_worker.js');
  if (fs.existsSync(localWorkerPath)) {
    return localWorkerPath;
  }

  return path.resolve(__dirname, '../../dist/algorithm/process_worker.js');
}
