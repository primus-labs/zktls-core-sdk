import { PrimusCoreTLS} from '../src/index';

// describe('listData function', () => {
//     // jest.setTimeout(50000);
    
//     const appId = "0x899dd126268e3010beaa1ac141a2a0aa98deba09";
//     const appSecret = "0x7da5d1cd2fdd494aa1176031151a6202734e30ddb14fd01dc3376616408ee0a7";
//     it('init', async () => {
//         const zkTLS = new PrimusCoreTLS();
//         const result = await zkTLS.init(appId, appSecret);
//         console.log("-------------test result=", result);
//     });
  
// });


describe('test', () => {
    jest.setTimeout(100000);
    // production
    const appId = "0xe319e567f70e2b2a153cb6ceaa73893648cde180";
    const appSecret = "0x4348563b2178adc171d851bcc27054d7879e07a41263ccfaa3b00d63d056559a";
    // test
    // const appId = "0x899dd126268e3010beaa1ac141a2a0aa98deba09";
    // const appSecret = "0x7da5d1cd2fdd494aa1176031151a6202734e30ddb14fd01dc3376616408ee0a7";
    it('generate', async () => {
        console.log('--------------process.env', process.env.NODE_ENV)
        try {
            // 1.
            const zkTLS = new PrimusCoreTLS();
            const result = await zkTLS.init(appId, appSecret);
            console.log("-------------init result=", result);
            
            let request = {
                url: "https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=BTC-USD",
                method: "GET",
                header: {},
                body: "",
            };
            
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }]
            const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves);

            generateRequestParamsRes.setAttMode({
                algorithmType: "proxytls",
                resultType: "plain"
            });
            generateRequestParamsRes.setNoProxy(false);

            // console.log("-------------generateRequestParams result=", generateRequestParamsRes);
            
            // 3.
            // const startAttestationRes =
            // const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            // await delay(800);
            const attestation = await zkTLS.startAttestation(generateRequestParamsRes);
            console.log("attestation=", attestation);
            console.log("attestation.data=", attestation.data);
            const verifyAttestationRes = zkTLS.verifyAttestation(attestation)
            console.log("verifyAttestationRes=", verifyAttestationRes);
        } catch (e) {
            console.log('-----------generate error =',  e);
        }
        
    });

    // it('generateBatchRequestUrl', async () => {
    //     console.log('--------------generateBatchRequestUrl-process.env', process.env.NODE_ENV)
    //     try {
    //         // 1.
    //         const zkTLS = new PrimusCoreTLS();
    //         const result = await zkTLS.init(appId, appSecret);
    //         console.log("-------------init result=", result);

    //         let request = [
    //             {
    //                 url: "https://edith.xiaohongshu.com/api/sns/web/v1/system/config",
    //                 method: "GET",
    //                 header: {},
    //                 body: "",
    //             },
    //             {
    //                 url: "https://edith.xiaohongshu.com/api/sns/web/v1/system/config",
    //                 method: "GET",
    //                 header: {},
    //                 body: "",
    //             }
    //         ];

    //         const responseResolves = [
    //             [
    //                 {
    //                     keyName: "1",
    //                     parseType: "json",
    //                     parsePath: "$",
    //                     op: "SHA256_EX"
    //                 }
    //             ],
    //             [
    //                 {
    //                     keyName: "2",
    //                     parseType: "json",
    //                     parsePath: "$",
    //                     op: "SHA256_EX"
    //                 }
    //             ]
    //         ];
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
    //         console.log('-----------generate error =', e);
    //     }

    // });
  
});
