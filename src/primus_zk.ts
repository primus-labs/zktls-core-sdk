// @ts-nocheck
import os from 'os';
import path from 'path';
global.WebSocket = require('ws');
export type AlgorithmBackend = 'auto' | 'native' | 'wasm';

const ALGORITHM_VERSION = '1.4.19';

const buildAlgorithmParams = (method: string, params: Record<string, unknown>) =>
  JSON.stringify({ method, version: ALGORITHM_VERSION, params });

async function initAlgorithm(mode: AlgorithmBackend = 'auto'): Promise<(params: string) => Promise<string>> {
  const tryLoadNative = (): ((params: string) => Promise<string>) | null => {
    try {
      const addon = require(path.join(__dirname, '../build/Release/primus-zktls-native.node'));
      console.log('[info] Native addon loaded.');
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
export const init = async (mode: AlgorithmBackend = 'auto') => {
  callAlgorithm = await initAlgorithm(mode);

  const logParams = buildAlgorithmParams('setLogLevel', { logLevel: 'info' });
  const logResult = await callAlgorithm(logParams);

  const params = buildAlgorithmParams('init', {});
  const result = await callAlgorithm(params);
  return result;
};


export const getAttestation = async (paramsObj: any) => {

  const params = buildAlgorithmParams('getAttestation', paramsObj);
  const result = await callAlgorithm(params);
  return JSON.parse(result);
};


export const getAttestationResult = async (timeout = 2 * 60 * 1000) => {
  const params = buildAlgorithmParams('getAttestationResult', { requestid: '1' });

  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = async () => {
      const timeGap = performance.now() - start;
      let resObj = null;
      try {
        const res = await callAlgorithm(params);
        resObj = JSON.parse(res);
      } catch (err) {
      }

      if (resObj && (resObj.retcode == "0" || resObj.retcode == "2")) {
        // console.log("resObj:", resObj);
        resolve(resObj);
      } else if (timeGap > timeout) {
        reject({
          code: 'timeout',
          data: resObj
        });
      } else {
        setTimeout(tick, 500);
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
