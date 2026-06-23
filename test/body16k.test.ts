import { PrimusCoreTLS } from '../src/index';

const REQUEST_BODY_SIZE_KIB = Number(process.env.ZKTLS_TEST_BODY_SIZE_KIB ?? 16);
const REQUEST_BODY_SIZE_BYTES = REQUEST_BODY_SIZE_KIB * 1024;

describe(`${REQUEST_BODY_SIZE_KIB}K request body`, () => {
    jest.setTimeout(10 * 60 * 1000);
    const appId = process.env.ZKTLS_APP_ID;
    const appSecret = process.env.ZKTLS_APP_SECRET;
    if (!appId || !appSecret) {
        throw new Error('ZKTLS_APP_ID and ZKTLS_APP_SECRET must be set in .env');
    }

    it(`generate attestation with a ${REQUEST_BODY_SIZE_KIB} KiB POST body`, async () => {
        const zkTLS = new PrimusCoreTLS();
        try {
            const result = await zkTLS.init(appId, appSecret);
            console.log("-------------init result=", result);

            const body = 'a'.repeat(REQUEST_BODY_SIZE_BYTES);
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
            expect(Buffer.byteLength(body, 'utf8')).toBe(REQUEST_BODY_SIZE_BYTES);
            expect(attDataObject.data).toBe(body);
            expect(Buffer.byteLength(attDataObject.data, 'utf8')).toBe(REQUEST_BODY_SIZE_BYTES);

            expect(attestation).toBeTruthy();
            expect(attestation.signatures?.length).toBeGreaterThan(0);
            expect(zkTLS.verifyAttestation(attestation)).toBe(true);
        } finally {
            await zkTLS.close();
        }
    });
});
