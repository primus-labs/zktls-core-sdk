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
        const zkTLS = new PrimusCoreTLS();
        try {
            // 1.
            const result = await zkTLS.init(appId, appSecret, {
                logLevel: 'debug',
                backend: 'wasm'});
            console.log("-------------init result=", result);

            const request = [
                {
                    url: "https://edith.xiaohongshu.com/api/sns/web/v1/system/config",
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
                        parsePath: "$.code"
                    }
                ],
            ];
            const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves);
            generateRequestParamsRes.setAttMode({
                algorithmType: "proxytls",
                resultType: "plain"
            });
            const attestation = await zkTLS.startAttestation(generateRequestParamsRes, 10 * 60 * 1000);
            console.log("attestation=", attestation);
            console.log("attestation.data=", attestation.data);
            expect(attestation).toBeTruthy();
            expect(attestation.signatures?.length).toBeGreaterThan(0);
            expect(zkTLS.verifyAttestation(attestation)).toBe(true);
        } finally {
            await zkTLS.close();
        }
    });

});
