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
    jest.setTimeout(50000);
    const appId = "0x899dd126268e3010beaa1ac141a2a0aa98deba09";
    const appSecret = "0x7da5d1cd2fdd494aa1176031151a6202734e30ddb14fd01dc3376616408ee0a7";
    it('generate', async () => {
        console.log('--------------process.env',  process.env.NODE_ENV)
        // 1.
        const zkTLS = new PrimusCoreTLS();
        // const result =
            await zkTLS.init(appId, appSecret);
        // console.log("-------------init result=", result);
        // 2.
        let request = {
            url: 'https://www.binance.com/bapi/accounts/v2/public/account/ip/country-city-short',
            method: 'GET',
            body: '',
            header: {}
        }
        const responseResolves = [{
            keyName: 'code',
            parsePath: '$.code',
            parseType: 'string'
        }]
        const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves)
        // console.log("-------------generateRequestParams result=", generateRequestParamsRes);
        // 3.
        // const startAttestationRes =
        // const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        // await delay(800);
        await zkTLS.startAttestation(generateRequestParamsRes)
    });
  
});
