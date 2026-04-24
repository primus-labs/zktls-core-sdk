import { PrimusCoreTLS } from '../src/index';


describe('test', () => {
    jest.setTimeout(100000);
    const appId = process.env.ZKTLS_APP_ID;
    const appSecret = process.env.ZKTLS_APP_SECRET;
    if (!appId || !appSecret) {
        throw new Error('ZKTLS_APP_ID and ZKTLS_APP_SECRET must be set in .env');
    }

    it('generateBatchRequestUrl', async () => {
        console.log('--------------generateBatchRequestUrl-process.env', process.env.NODE_ENV)
        try {
            // 1.
            const zkTLS = new PrimusCoreTLS();
            const result = await zkTLS.init(appId, appSecret);
            console.log("-------------init result=", result);

            let request = [
                {
                    url: "https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=BTC-USD",
                    method: "GET",
                    header: {},
                    body: "",
                },
            ];
            const responseResolves = [
                [
                    {
                        keyName: "instType",
                        parseType: "json",
                        parsePath: "#?instType",
                    }
                ],
            ];
            const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves);
            const attConditions = [
                [{ field: 'instType', op: 'SHA256_WITH_SALT'}],
            ];
            generateRequestParamsRes.setAttConditions(attConditions);
            const attestation = await zkTLS.startAttestation(generateRequestParamsRes, 10 * 60 * 1000);
            console.log("attestation=", attestation);
            const verifyAttestationRes = zkTLS.verifyAttestation(attestation)
            console.log("verifyAttestationRes=", verifyAttestationRes);

            
            // Recompute the salted request hash from private data and verify it matches the attested query hash.
            const privateData = zkTLS.getPrivateData(generateRequestParamsRes.requestid!, "instType");
            console.log("privateData=", privateData);
            const reqContentBytes = new TextEncoder().encode("SPOT");
            const reqSalt = zkTLS.getPrivateData(generateRequestParamsRes.requestid!, "instType");;
            const reqBytes = new Uint8Array([ ...reqContentBytes, ...hexDecodeToBytes(reqSalt!)]);
            const reqHash = await sha256Bytes(reqBytes);
            console.log('compute reqHash ===', reqHash);
            console.log("attestation.data=", attestation.data);
            const attDataObject = JSON.parse(attestation.data);
            const attReqQueryHash = attDataObject["instType"];
            expect(reqHash).toBe(attReqQueryHash);
        } catch (e) {
            console.log('-----------generate error =', e);
        }
    });
});

const hexDecodeToBytes = (hex: string): Uint8Array => {
    const match = hex.replace(/^0x/i, '').match(/.{1,2}/g);
    if (!match || hex.length % 2 !== 0) {
      throw new Error(`Invalid hex string: ${hex}`);
    }
    return new Uint8Array(match.map(byte => parseInt(byte, 16)));
  };
  
  const sha256Bytes = async (bytes: Uint8Array): Promise<string> => {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const hashBuffer = await (globalThis.crypto?.subtle
      ? globalThis.crypto.subtle.digest('SHA-256', buffer)
      : require('crypto').webcrypto.subtle.digest('SHA-256', buffer));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };
