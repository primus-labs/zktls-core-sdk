const { getAttestation, getAttestationResult } = require("./primus_zk.js");

async function test_local_0() {
  const params = JSON.parse(`{"requestid":"1","version":"1.1.1","source":"local","setHostName":"true","baseName":"localhost","basePort":"8080","padoUrl":"ws://192.168.20.128:8082","proxyUrl":"ws://192.168.20.128:8083","errLogUrl":"","offlineTimeout":"43210","cipher":"ECDHE-ECDSA-AES128-GCM-SHA256","isExtendedMasterSecret":"true","enableOptRounds":"false","isUserClick":"true","hasFirstReq":"true","getdatatime":"111234567","user":{"userid":"0123456789","address":"0x2A46883d79e4Caf14BCC2Fbf18D9f12A8bB18D07","token":"xxx"},"baseValue":"1000","schemaType":"","ext":{"calculationType":"","extRequests":{"orders":["default"],"default":{"httpMessage":"","url":"https://localhost/api/v1/getvalue1","method":"GET","headers":{},"body":"","parseSchema":""}}},"reqType":"web","host":"localhost","requests":[{"name":"first","url":"https://localhost/api/v1/getvalue1"},{"name":"kyc","url":"https://localhost/simulate/binance/asset/proof#sapi/v3/asset/getUserAsset","method":"POST","headers":{"Content-Type":"application/x-www.form-urlencoded","binance-key":"OJDWIjwidjwhfwo81832"},"body":{},"cookies":{"p20t":"web.44509307.42A309E6C38E103F050B8043EE67EE40"}}],"responses":[{},{"conditions":{"type":"FIELD_RANGE","field":{"type":"FIELD_ARITHMETIC","op":"+","field":"$.[*]+","subfields":[{"type":"FIELD_ARITHMETIC","op":"*","subfields":[{"type":"FIELD_ARITHMETIC","op":"GET_PRICE","field":"+.asset"},{"type":"FIELD_ARITHMETIC","op":"+","subfields":["+.free","+.freeze","+.locked","+.withdrawing"]}]}]},"op":">","value":"0.01"}}]}`);
  await getAttestation(params);

  const result = await getAttestationResult();
  console.log("result", result);

  process.exit(0); // exit
}

test_local_0();
