// support websocket
global.WebSocket = require('ws');

// load wasm module
Module_callAlgorithm = null;
const Module = require("./algorithm/client_plugin.js");
Module.onRuntimeInitialized = async () => {
  console.log("Module Initialized OK.");
  Module_callAlgorithm = Module.cwrap('callAlgorithm', 'string', ['string']);
}

const callAlgorithm = async (params) => {
  if (!Module_callAlgorithm) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return Module_callAlgorithm(params);
};

exports.init = async () => {
  const params = `{"method":"init","version":"1.1.1","params":{}}`;
  const result = await callAlgorithm(params);
  return result;
};


exports.getAttestation = async (paramsObj) => {

  const _paramsObj = { method: "getAttestation", version: "1.1.1", params: paramsObj };
  const params = JSON.stringify(_paramsObj);
  const result = await callAlgorithm(params);
  return JSON.parse(result);
};


exports.getAttestationResult = async (timeout = 2 * 60 * 1000) => {
  const params = `{"method":"getAttestationResult","version":"1.1.1","params":{"requestid":"1"}}`;

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
        resolve(resObj);
      } else if (timeGap > timeout) {
        reject({
          code: 'timeout',
          data: resObj
        });
      } else {
        setTimeout(tick, 1000);
      }
    };
    tick();
  });
}

exports.getAttestationConfig = () => {
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
    requests: [], // should set
    responses: [], // should set
    templateId: "5555555555555555555",
    PADOSERVERURL: "https://api-dev.padolabs.org",
    padoExtensionVersion: "0.3.19"
  }
  return attestationParams;
}


