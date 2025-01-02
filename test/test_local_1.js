const { getAttestationConfig, getAttestation, getAttestationResult } = require("./primus_zk.js");


async function test_local_1() {
  // step 0: get the default config
  var attParams = getAttestationConfig();

  // (optional) set padoUrl,proxyUrl,basePort if neccessary
  attParams.basePort = "8080";
  attParams.padoUrl = "ws://192.168.20.128:8082";
  attParams.proxyUrl = "ws://192.168.20.128:8083";

  // (optional) set appParameters if neccessary

  // (optional) set cipher if neccessary
  attParams.cipher = "ECDHE-ECDSA-AES128-GCM-SHA256";

  // (MUST) set host,requests,responses
  attParams.host = "localhost";
  const request = {
    // should set
    "name": "some-name",
    // should set
    "url": "https://localhost/simulate/binance/web/countries#/bapi/kyc/v2/private/certificate/user-kyc/current-kyc-status",
    // optional, default is GET
    "method": "POST",
    // optional, should set if the method is POST and the body is set
    "headers": {
      "Content-Type": "application/x-www.form-urlencoded"
    },
    // optional, can be string, array, object
    "body": {},
    // optional
    "cookies": {
      "p20t": "web.44509307.42A309E6C38E103F050B8043EE67EE40"
    }
  };

  attParams.requests.push(request);

  const response = {
    "conditions": {
      "type": "CONDITION_EXPANSION",
      "op": "&",
      "subconditions": [
        {
          "field": "$.data.kycSubStatus",
          "op": "REVEAL_STRING",
          "reveal_id": "kycSubStatus",
          "type": "FIELD_REVEAL"
        }
      ]
    }
  };
  attParams.responses.push(response);

  // step z: call getAttestation
  await getAttestation(attParams);

  // get the result
  const result = await getAttestationResult(60 * 1000);
  console.log("result", result);

  process.exit(0); // exit
}

test_local_1();

