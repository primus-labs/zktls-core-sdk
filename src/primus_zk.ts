// support websocket
global.WebSocket = require('ws');
import PrimusZkModule from "./algorithm/client_plugin.js";

var Module_callAlgorithm: any = null;
const callAlgorithm = async (params: string) => {
  if (!Module_callAlgorithm) {
    const primusZkModule = await PrimusZkModule();
    // console.log('primusZkModule Initialized OK', primusZkModule);
    console.log('primusZkModule Initialized OK');
    Module_callAlgorithm = primusZkModule.cwrap('callAlgorithm', 'string', ['string']);
  }
  return Module_callAlgorithm(params);
};

export const init = async () => {
  const params = `{"method":"init","version":"1.1.1","params":{}}`;
  console.log('enter init. params:', params);
  const result = await callAlgorithm(params);
  console.log('leave init. result:', result);
  return result;
};

export const getAttestation = async (paramsObj: any) => {
  await init();
  const _paramsObj = { method: "getAttestation", version: "1.1.1", params: paramsObj };
  const params = JSON.stringify(_paramsObj);
  console.log('enter getAttestation. params:', params);
  const result = await callAlgorithm(params);
  console.log('leave getAttestation. result:', result);
  return result;
};
export const getAttestationResult = async (timeout = 2 * 60 * 1000) => {
  const params = `{"method":"getAttestationResult","version":"1.1.1","params":{"requestid":"1"}}`;
  console.log('enter getAttestationResult. params:', params);
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = async () => {
      const timeGap = performance.now() - start;
      let resObj = null;
      try {
        const res = await callAlgorithm(params);
        resObj = JSON.parse(res);
      }
      catch (err) {
      }
      // console.log("resObj", resObj);
      if (resObj && (resObj.retcode == "0" || resObj.retcode == "2")) {
        resolve(resObj);
      }
      else if (timeGap > timeout) {
        reject('timeout');
      }
      else {
        setTimeout(tick, 1000);
      }
    };
    tick();
  });
};

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
    appParameters: {
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
  };
  return attestationParams;
};
