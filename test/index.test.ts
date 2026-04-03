import { PrimusCoreTLS } from '../src/index';

// describe('listData function', () => {
//     // jest.setTimeout(50000);

//     const appId = process.env.ZKTLS_APP_ID;
//     const appSecret = process.env.ZKTLS_APP_SECRET;
//     if (!appId || !appSecret) {
//        throw new Error('ZKTLS_APP_ID and ZKTLS_APP_SECRET must be set in .env');
//     }
//     it('init', async () => {
//         const zkTLS = new PrimusCoreTLS();
//         const result = await zkTLS.init(appId, appSecret);
//         console.log("-------------test result=", result);
//     });

// });


describe('test', () => {
    jest.setTimeout(100000);
    const appId = process.env.ZKTLS_APP_ID;
    const appSecret = process.env.ZKTLS_APP_SECRET;
    if (!appId || !appSecret) {
        throw new Error('ZKTLS_APP_ID and ZKTLS_APP_SECRET must be set in .env');
    }
    // it('generate', async () => {

    //     try {
    //         const zkTLS = new PrimusCoreTLS();
    //         const result = await zkTLS.init(appId, appSecret);
    //         console.log("-------------init result=", result);

    //         let request = {
    //             url: "https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=BTC-USD",
    //             method: "GET",
    //             header: {},
    //             body: "",
    //         };

    //         const responseResolves = [{
    //             keyName: "instType",
    //             parseType: "json",
    //             parsePath: "$.data[0].instType"
    //         }]
    //         const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves);

    //         generateRequestParamsRes.setAttMode({
    //             algorithmType: "proxytls",
    //             resultType: "plain"
    //         });
    //         generateRequestParamsRes.setNoProxy(false);

    //         // console.log("-------------generateRequestParams result=", generateRequestParamsRes);

    //         // 3.
    //         // const startAttestationRes =
    //         // const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    //         // await delay(800);
    //         const attestation = await zkTLS.startAttestation(generateRequestParamsRes);
    //         console.log("attestation=", attestation);
    //         console.log("attestation.data=", attestation.data);
    //         const verifyAttestationRes = zkTLS.verifyAttestation(attestation)
    //         console.log("verifyAttestationRes=", verifyAttestationRes);
    //     } catch (e) {
    //         console.log('-----------generate error =',  e);
    //     }

    // });

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
                {
                    url: "https://www.okx.com/api/v5/public/time",
                    method: "GET",
                    header: {},
                    body: "",
                }
            ];

            const responseResolves = [
                [
                    {
                        keyName: "instType",
                        parseType: "json",
                        parsePath: "$.data[0].instType"
                    }
                ],
                [
                    {
                        keyName: "time",
                        parseType: "json",
                        parsePath: "$.data[0].ts",
                    }
                ]
            ];

            
            const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves);

            // const attConditions = [
            //     [{ field: 'instType', op: 'STREQ', value: 'SPOT' }],
            //     [{ field: 'time', op: 'STRNEQ', value: '1716835200' }],
            //   ];
            // generateRequestParamsRes.setAttConditions(attConditions);

            generateRequestParamsRes.setAttMode({
                algorithmType: "proxytls",
                resultType: "plain"
            });
            // generateRequestParamsRes.setNoProxy(false);

            // Set the request interval to 1000 milliseconds (1 second)
            // generateRequestParamsRes.setRequestInterval(1000);

            // console.log("-------------generateRequestParams result=", generateRequestParamsRes);

            // 3.
            // const startAttestationRes =
            // const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            // await delay(800);
            const attestation = await zkTLS.startAttestation(generateRequestParamsRes, 10 * 60 * 1000);
            console.log("attestation=", attestation);
            console.log("attestation.data=", attestation.data);
            const verifyAttestationRes = zkTLS.verifyAttestation(attestation)
            console.log("verifyAttestationRes=", verifyAttestationRes);
        } catch (e) {
            console.log('-----------generate error =', e);
        }

    });

});