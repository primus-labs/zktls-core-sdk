// @ts-nocheck
import os from 'os';
import path from 'path';
global.WebSocket = require('ws');
export type AlgorithmBackend = 'auto' | 'native' | 'wasm';
export type AlgorithmLogLevel = 'debug' | 'info' | 'perf' | 'error';
export type GetAttestationResultOptions = {
  timeout?: number;
  pollIntervalMs?: number;
  onResult?: (result: unknown) => void | Promise<void>;
};
export type GetAttestationOptions = {
  onStream?: (result: unknown) => void | Promise<void>;
};
let currentStreamContext: { paramsObj: any; options: GetAttestationOptions } | undefined;

const ALGORITHM_VERSION = '1.4.33';

const buildAlgorithmParams = (method: string, params: Record<string, unknown>) =>
  JSON.stringify({ method, version: ALGORITHM_VERSION, params });

let nativeAddon: any = null;
async function initAlgorithm(mode: AlgorithmBackend = 'auto'): Promise<(params: string) => Promise<string>> {
  const tryLoadNative = (): ((params: string) => Promise<string>) | null => {
    try {
      const addon = require(path.join(__dirname, '../build/Release/primus-zktls-native.node'));
      console.log('[info] Native addon loaded.');
      nativeAddon = addon;
      return async (params: string) => addon.callAlgorithm(params);
    } catch (e) {
      console.warn('[warn] Native addon failed:', e.message);
      return null;
    }
  };

  const tryLoadWasm = async (): Promise<((params: string) => Promise<string>) | null> => {
    try {
      const Module = require('./algorithm/client_plugin.js');
      return new Promise((resolve, reject) => {
        Module.onRuntimeInitialized = () => {
          try {
            const Module_callAlgorithm = Module.cwrap('callAlgorithm', 'string', ['string']);
            console.log('[info] WASM module initialized.');
            resolve(async (params: string) => Module_callAlgorithm(params));
          } catch (e) {
            console.error('[error] cwrap failed:', e);
            reject(e);
          }
        };

        setTimeout(() => {
          reject(new Error('WASM module initialization timeout.'));
        }, 5000); // e.g. 5s
      });
    } catch (e) {
      console.error('[error] WASM module load failed:', e);
      return null;
    }
  };

  if (mode === 'native') {
    const native = await tryLoadNative();
    if (!native) throw new Error('Native mode requested but addon not available.');
    return native;
  }

  if (mode === 'wasm') {
    return await tryLoadWasm();
  }

  // auto
  const native = await tryLoadNative();
  if (native) {
    console.log("Use Native Mode.");
    return native
  };

  console.log("Use WASM Mode.");
  return await tryLoadWasm();
}

let callAlgorithm = null;
export const init = async (mode: AlgorithmBackend = 'auto', logLevel: AlgorithmLogLevel = 'error') => {
  callAlgorithm = await initAlgorithm(mode);

  const logParams = buildAlgorithmParams('setLogLevel', { logLevel });
  const logResult = await callAlgorithm(logParams);

  const params = buildAlgorithmParams('init', {});
  const result = await callAlgorithm(params);
  return result;
};

function processRpc(msg: string): string {
  // console.log("[js] recv rpc data:", msg);
  return '{"data":"response from NodeJS"}';
}
function processStream(buf: Uint8Array) {
  // console.log("[js] recv stream data:", buf.length, buf, "data:", Buffer.from(buf).toString('utf8'));
  const paramsObj = currentStreamContext?.paramsObj;
  if (!paramsObj) {
    return;
  }
  const streamResult = {
    retcode: '1',
    status: 'streaming',
    requestid: paramsObj.requestid,
    content: {
      data: buf,
    },
  };
  Promise.resolve(currentStreamContext?.options.onStream?.(streamResult)).catch((err) => {
    console.error("[error] stream callback failed:", err);
  });
}
function registerCallback(paramsObj: any) {
  console.log("paramsObj.rpc", paramsObj.rpc, "paramsObj.stream", paramsObj.stream);
  // unregister first
  if (nativeAddon) {
    nativeAddon.setRpcHandler();
    nativeAddon.setStreamHandler();
  } else {
    globalThis._onRpc = undefined;
    globalThis._onStream = undefined;
  }
  if (paramsObj.rpc === "true" || paramsObj.rpc === true) {
    if (nativeAddon) {
      nativeAddon.setRpcHandler(processRpc);
    } else {
      globalThis._onRpc = processRpc;
    }
  }
  if (paramsObj.stream === "true" || paramsObj.stream === true) {
    if (nativeAddon) {
      nativeAddon.setStreamHandler(processStream);
    } else {
      globalThis._onStream = processStream;
    }
  }
}

export const getAttestation = async (paramsObj: any, options: GetAttestationOptions = {}) => {
  currentStreamContext = paramsObj.stream === "true" || paramsObj.stream === true ? { paramsObj, options } : undefined;
  registerCallback(paramsObj);

  const params = buildAlgorithmParams('getAttestation', paramsObj);
  const result = await callAlgorithm(params);
  return JSON.parse(result);
};


export const getAttestationResult = async (optionsOrTimeout: number | GetAttestationResultOptions = 2 * 60 * 1000) => {
  const options: GetAttestationResultOptions =
    typeof optionsOrTimeout === 'number' ? { timeout: optionsOrTimeout } : optionsOrTimeout;
  const timeout = options.timeout ?? 2 * 60 * 1000;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const params = buildAlgorithmParams('getAttestationResult', { requestid: '1' });

  return new Promise((resolve, reject) => {
    const start = performance.now();
    let lastResult = null;
    const tick = async () => {
      const timeGap = performance.now() - start;
      let resObj = null;
      try {
        const res = await callAlgorithm(params);
        resObj = JSON.parse(res);
        if (resObj) {
          lastResult = resObj;
        }
      } catch (err) {
      }

      if (resObj && (resObj.retcode == "0" || resObj.retcode == "2")) {
        // console.log("resObj:", resObj);
        resolve(resObj);
      } else if (resObj && resObj.retcode == "1") {
        Promise.resolve(options.onResult?.(resObj))
          .then(() => {
            if (performance.now() - start > timeout) {
              reject({
                code: 'timeout',
                data: lastResult
              });
            } else {
              setTimeout(tick, pollIntervalMs);
            }
          })
          .catch(reject);
      } else if (timeGap > timeout) {
        reject({
          code: 'timeout',
          data: lastResult
        });
      } else {
        setTimeout(tick, pollIntervalMs);
      }
    };
    tick();
  });
}

export const getAttestationConfig = () => {
  const attestationParams = {
    source: "source", // not empty
    requestid: "d9415490-3bc3-49ac-93ca-97165aa2a4a1", // todo:auto generate
    padoUrl: "wss://api-dev.padolabs.org/algorithm-proxyV2", // should set
    proxyUrl: "wss://api-dev.padolabs.org/algoproxyV2", // should set
    basePort: "443",
    getdatatime: "1735028372985", // todo:auto generate
    credVersion: "1.0.5",
    modelType: "proxytls", // one of [mpctls, proxytls]
    user: {
      userid: "1111111111111111111",
      address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    authUseridHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    appParameters: { // should set
      appId: "0x3333333333333333333333333333333333333333",
      appSignParameters: "{}",
      appSignature: "0xcccccccccccccccccccccccccccccccccccccccc",
      additionParams: ""
    },
    reqType: "web",
    host: "localhost.com", // should set
    // requests: any, // should set
    // responses: any, // should set
    templateId: "5555555555555555555",
    PADOSERVERURL: "https://api-dev.padolabs.org",
    padoExtensionVersion: "0.3.19"
  }
  return attestationParams;
}
