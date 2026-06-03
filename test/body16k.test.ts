import { PrimusCoreTLS } from '../src/index';

describe('16K request body', () => {
    jest.setTimeout(10 * 60 * 1000);
    const appId = process.env.ZKTLS_APP_ID;
    const appSecret = process.env.ZKTLS_APP_SECRET;
    if (!appId || !appSecret) {
        throw new Error('ZKTLS_APP_ID and ZKTLS_APP_SECRET must be set in .env');
    }

    it('generate attestation with a 16 KiB POST body', async () => {
        const zkTLS = new PrimusCoreTLS();
        const result = await zkTLS.init(appId, appSecret);
        console.log("-------------init result=", result);

        const body = 'a'.repeat(16 * 1024);
        const request = {
            url: "https://postman-echo.com/post",
            method: "POST",
            header: {
                "Content-Type": "text/plain",
            },
            body,
        };

        const responseResolves = [{
            keyName: "data",
            parseType: "json",
            parsePath: "$.data",
        }];
        const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves);

        generateRequestParamsRes.setAttMode({
            algorithmType: "proxytls",
            resultType: "plain"
        });

        const attestation = await zkTLS.startAttestation(generateRequestParamsRes, 10 * 60 * 1000);
        console.log("attestation=", attestation);
        console.log("attestation.data=", attestation.data);

        const attDataObject = JSON.parse(attestation.data);
        expect(Buffer.byteLength(body, 'utf8')).toBe(16 * 1024);
        expect(attDataObject.data).toBe(body);
        expect(Buffer.byteLength(attDataObject.data, 'utf8')).toBe(16 * 1024);

        const verifyAttestationRes = zkTLS.verifyAttestation(attestation);
        console.log("verifyAttestationRes=", verifyAttestationRes);
    });
});
