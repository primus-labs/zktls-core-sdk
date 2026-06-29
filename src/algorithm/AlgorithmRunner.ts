import type { AlgorithmBackend, AlgorithmLogLevel } from '../primus_zk';

export type AlgorithmRunnerInitOptions = {
  backend: AlgorithmBackend;
  logLevel: AlgorithmLogLevel;
  logLength: number;
};

export type RunAttestationOptions = {
  timeout: number;
  pollIntervalMs: number;
  onResult?: (result: unknown) => void | Promise<void>;
};

export interface AlgorithmRunner {
  init(options: AlgorithmRunnerInitOptions): Promise<string | boolean>;
  runAttestation(attParams: unknown, options: RunAttestationOptions): Promise<unknown>;
  close?(): Promise<void>;
}

export type SerializedError = {
  name?: string;
  message: string;
  code?: unknown;
  stack?: string;
  data?: unknown;
};

export type ParentToChildMessage =
  | {
      id: string;
      type: 'init';
      backend: AlgorithmBackend;
      logLevel: AlgorithmLogLevel;
      logLength: number;
    }
  | {
      id: string;
      type: 'attest';
      params: unknown;
      timeout: number;
      pollIntervalMs: number;
    }
  | {
      id: string;
      type: 'close';
    };

export type ChildToParentMessage =
  | {
      id: string;
      type: 'ready';
      result: unknown;
    }
  | {
      id: string;
      type: 'progress';
      result: unknown;
    }
  | {
      id: string;
      type: 'done';
      result: unknown;
    }
  | {
      id: string;
      type: 'error';
      error: SerializedError;
    };

export type WorkerProcess = {
  send(message: unknown): boolean | void;
  kill(): boolean | void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; data?: unknown };
    return {
      name: error.name,
      message: error.message,
      code: withCode.code,
      stack: error.stack,
      data: withCode.data,
    };
  }
  return {
    message: typeof error === 'string' ? error : JSON.stringify(error),
  };
}

export function deserializeError(error: SerializedError): Error {
  const deserialized = new Error(error.message);
  deserialized.name = error.name || 'Error';
  if (error.stack) {
    deserialized.stack = error.stack;
  }
  Object.assign(deserialized, {
    code: error.code,
    data: error.data,
  });
  return deserialized;
}
