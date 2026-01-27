import { PrimusCoreTLS} from '../src/index';
import { ZkAttestationError } from '../src/classes/Error';

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
    // const appId = "0x1b8b7e9fe057e1a88d286ed5801731cb13dcab59";
    // const appSecret = "0xb3cf0fe0f211a6bf231ded507ef9f00004b9c1d308e78294481d8c1fae203486"
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
            // // setAttConditions
            // generateRequestParamsRes.setAttConditions([
            //     [
            //       {
            //         field: "instType",
            //         op: "STREQ",
            //         value: 'abc',
            //       },
            //     ],
            //   ]);

            // console.log("-------------generateRequestParams result=", generateRequestParamsRes.attConditions);
            
            // 3.
            // const startAttestationRes =
            // const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            // await delay(800);
            // console.log('generateRequestParamsRes', generateRequestParamsRes.attConditions)
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
    //                 url: "https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=BTC-USD",
    //                 method: "GET",
    //                 header: {},
    //                 body: "",
    //             },
    //             {
    //                 url: "https://www.okx.com/api/v5/public/time",
    //                 method: "GET",
    //                 header: {},
    //                 body: "",
    //             }
    //         ];

    //         const responseResolves = [
    //             [
    //                 {
    //                     keyName: "instType",
    //                     parseType: "json",
    //                     parsePath: "$.data[0].instType"
    //                 }
    //             ],
    //             [
    //                 {
    //                     keyName: "time",
    //                     parseType: "json",
    //                     parsePath: "$.data[0].ts",
    //                 }
    //             ]
    //         ];
    //         const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves);

    //         generateRequestParamsRes.setAttMode({
    //             algorithmType: "mpctls",
    //             resultType: "plain"
    //         });
    //         // generateRequestParamsRes.setNoProxy(false);

    //         // Set the request interval to 1000 milliseconds (1 second)
    //         // generateRequestParamsRes.setRequestInterval(1000);

    //         // console.log("-------------generateRequestParams result=", generateRequestParamsRes);

    //         // 3.
    //         // const startAttestationRes =
    //         // const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    //         // await delay(800);
    //         const attestation = await zkTLS.startAttestation(generateRequestParamsRes, 10 * 60 * 1000);
    //         console.log("attestation=", attestation);
    //         console.log("attestation.data=", attestation.data);
    //         const verifyAttestationRes = zkTLS.verifyAttestation(attestation)
    //         console.log("verifyAttestationRes=", verifyAttestationRes);
    //     } catch (e) {
    //         console.log('-----------generate error =', e);
    //     }

    // });
  
});

describe('Parameter validation tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateRequestParams validation', () => {
        it('should throw error when request is null', () => {
            const zkTLS = new PrimusCoreTLS();
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }];
            
            expect(() => {
                zkTLS.generateRequestParams(null as any, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(null as any, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Missing request parameter');
            }
        });

        it('should throw error when request.url is missing', () => {
            const zkTLS = new PrimusCoreTLS();
            const request = {
                method: "GET",
                header: {},
                body: "",
            };
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }];
            
            expect(() => {
                zkTLS.generateRequestParams(request as any, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(request as any, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Missing or invalid request.url');
            }
        });

        it('should throw error when request.url is empty string', () => {
            const zkTLS = new PrimusCoreTLS();
            const request = {
                url: "",
                method: "GET",
                header: {},
                body: "",
            };
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }];
            
            expect(() => {
                zkTLS.generateRequestParams(request, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(request, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Missing or invalid request.url');
            }
        });

        it('should throw error when request.url is not a valid URL', () => {
            const zkTLS = new PrimusCoreTLS();
            const request = {
                url: "not-a-valid-url",
                method: "GET",
                header: {},
                body: "",
            };
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }];
            
            expect(() => {
                zkTLS.generateRequestParams(request, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(request, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Invalid URL format');
            }
        });

        it('should throw error when request.method is missing', () => {
            const zkTLS = new PrimusCoreTLS();
            const request = {
                url: "https://www.okx.com/api/v5/public/instruments",
                header: {},
                body: "",
            };
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }];
            
            expect(() => {
                zkTLS.generateRequestParams(request as any, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(request as any, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Missing or invalid request.method');
            }
        });

        it('should throw error when request.method is empty string', () => {
            const zkTLS = new PrimusCoreTLS();
            const request = {
                url: "https://www.okx.com/api/v5/public/instruments",
                method: "",
                header: {},
                body: "",
            };
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }];
            
            expect(() => {
                zkTLS.generateRequestParams(request, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(request, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Missing or invalid request.method');
            }
        });

        it('should throw error when request.method is invalid (e.g., "abc")', () => {
            const zkTLS = new PrimusCoreTLS();
            const request = {
                url: "https://www.okx.com/api/v5/public/instruments",
                method: "abc",
                header: {},
                body: "",
            };
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }];
            
            expect(() => {
                zkTLS.generateRequestParams(request, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(request, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Invalid HTTP method');
                expect(e.message).toContain('abc');
            }
        });

        it('should accept valid request with valid URL and method', () => {
            const zkTLS = new PrimusCoreTLS();
            const request = {
                url: "https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=BTC-USD",
                method: "GET",
                header: {},
                body: "",
            };
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }];
            
            expect(() => {
                zkTLS.generateRequestParams(request, responseResolves);
            }).not.toThrow();
        });

        it('should accept valid HTTP methods (POST, PUT, DELETE, etc.)', () => {
            const zkTLS = new PrimusCoreTLS();
            const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
            
            validMethods.forEach(method => {
                const request = {
                    url: "https://www.okx.com/api/v5/public/instruments",
                    method: method,
                    header: {},
                    body: "",
                };
                const responseResolves = [{
                    keyName: "instType",
                    parseType: "json",
                    parsePath: "$.data[0].instType"
                }];
                
                expect(() => {
                    zkTLS.generateRequestParams(request, responseResolves);
                }).not.toThrow();
            });
        });

        it('should throw error when request array contains invalid URL', () => {
            const zkTLS = new PrimusCoreTLS();
            const request = [
                {
                    url: "https://www.okx.com/api/v5/public/instruments",
                    method: "GET",
                    header: {},
                    body: "",
                },
                {
                    url: "invalid-url",
                    method: "GET",
                    header: {},
                    body: "",
                }
            ];
            const responseResolves = [
                [{
                    keyName: "instType",
                    parseType: "json",
                    parsePath: "$.data[0].instType"
                }],
                [{
                    keyName: "time",
                    parseType: "json",
                    parsePath: "$.data[0].ts"
                }]
            ];
            
            expect(() => {
                zkTLS.generateRequestParams(request, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(request, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Invalid URL format at index 1');
            }
        });

        it('should throw error when request array contains invalid method', () => {
            const zkTLS = new PrimusCoreTLS();
            const request = [
                {
                    url: "https://www.okx.com/api/v5/public/instruments",
                    method: "GET",
                    header: {},
                    body: "",
                },
                {
                    url: "https://www.okx.com/api/v5/public/time",
                    method: "abc",
                    header: {},
                    body: "",
                }
            ];
            const responseResolves = [
                [{
                    keyName: "instType",
                    parseType: "json",
                    parsePath: "$.data[0].instType"
                }],
                [{
                    keyName: "time",
                    parseType: "json",
                    parsePath: "$.data[0].ts"
                }]
            ];
            
            expect(() => {
                zkTLS.generateRequestParams(request, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(request, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Invalid HTTP method at index 1');
            }
        });
    });

    describe('startAttestation validation', () => {
        it('should throw error when attRequest has invalid URL', () => {
            const zkTLS = new PrimusCoreTLS();
            // Note: We don't need to init for parameter validation
            // The validation happens in generateRequestParams, which throws before startAttestation
            
            const request = {
                url: "invalid-url",
                method: "GET",
                header: {},
                body: "",
            };
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }];
            
            // generateRequestParams should throw error before we even call startAttestation
            expect(() => {
                zkTLS.generateRequestParams(request, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(request, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Invalid URL format');
            }
        });

        it('should throw error when attRequest has invalid method', () => {
            const zkTLS = new PrimusCoreTLS();
            // Note: We don't need to init for parameter validation
            // The validation happens in generateRequestParams, which throws before startAttestation
            
            const request = {
                url: "https://www.okx.com/api/v5/public/instruments",
                method: "abc",
                header: {},
                body: "",
            };
            const responseResolves = [{
                keyName: "instType",
                parseType: "json",
                parsePath: "$.data[0].instType"
            }];
            
            // generateRequestParams should throw error before we even call startAttestation
            expect(() => {
                zkTLS.generateRequestParams(request, responseResolves);
            }).toThrow(ZkAttestationError);
            
            try {
                zkTLS.generateRequestParams(request, responseResolves);
            } catch (e: any) {
                expect(e.code).toBe('00005');
                expect(e.message).toContain('Invalid HTTP method');
            }
        });
    });
});
