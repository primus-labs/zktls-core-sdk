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
    // jest.setTimeout(50000);
    const appId = "0x899dd126268e3010beaa1ac141a2a0aa98deba09";
    const appSecret = "0x7da5d1cd2fdd494aa1176031151a6202734e30ddb14fd01dc3376616408ee0a7";
    it('generate', async () => {
        // 1.
        const zkTLS = new PrimusCoreTLS();
        const result = await zkTLS.init(appId, appSecret);
        console.log("-------------init result=", result);
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
        const userAddr = '0x3B86401865D9C17A51C51D6D5f5aabA733Dd8E14'
        const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves, userAddr)
        console.log("-------------generateRequestParams result=", generateRequestParamsRes);
        // 3.
        // const signParams = generateRequestParamsRes.toJsonString()
        //  console.log("-------------sign signParams=", signParams);
        // const signRes = await zkTLS.sign(signParams)
        // console.log("-------------sign result=", signRes);
        // 3.
        // const startAttestationRes =
            await zkTLS.startAttestation(generateRequestParamsRes)
    });
  
});
//   import { AttRequest, AttNetworkRequest, AttNetworkResponseResolve } from './attRequest'; // 假设这些类在attRequest文件中定义

// describe('generateRequestParams', () => {
//   let instance: any; // 假设实例化了包含generateRequestParams方法的类

//   beforeEach(() => {
//     // 假设我们有一个类，其中包含generateRequestParams方法
//     // 例如：instance = new SomeClass();
//     instance = {
//       appId: 'testAppId',
//       generateRequestParams: function(request: AttNetworkRequest, responseResolves: AttNetworkResponseResolve[], userAddress?: string): AttRequest {
//         const userAddr = userAddress ? userAddress : "0x7ab44DE0156925fe0c24482a2cDe48C465e47573";
//         return new AttRequest({
//           appId: this.appId,
//           request,
//           responseResolves,
//           userAddress: userAddr
//         });
//       }
//     };
//   });

//   it('should generate request params with provided userAddress', () => {
//     const request = new AttNetworkRequest({ method: 'GET', url: 'http://example.com' });
//     const responseResolves = [new AttNetworkResponseResolve({ status: 200 })];
//     const userAddress = '0x1234567890abcdef1234567890abcdef12345678';
    
//     const result = instance.generateRequestParams(request, responseResolves, userAddress);

//     expect(result.userAddress).toBe(userAddress);
//     expect(result.request).toBe(request);
//     expect(result.responseResolves).toBe(responseResolves);
//     expect(result.appId).toBe(instance.appId);
//   });

//   it('should generate request params with default userAddress when not provided', () => {
//     const request = new AttNetworkRequest({ method: 'GET', url: 'http://example.com' });
//     const responseResolves = [new AttNetworkResponseResolve({ status: 200 })];
    
//     const result = instance.generateRequestParams(request, responseResolves);

//     expect(result.userAddress).toBe("0x7ab44DE0156925fe0c24482a2cDe48C465e47573");
//     expect(result.request).toBe(request);
//     expect(result.responseResolves).toBe(responseResolves);
//     expect(result.appId).toBe(instance.appId);
//   });
// });