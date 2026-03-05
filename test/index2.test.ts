import { PrimusCoreTLS} from '../src/index';

describe('test', () => {
    jest.setTimeout(100000);
    const appId = process.env.ZKTLS_APP_ID;
    const appSecret = process.env.ZKTLS_APP_SECRET;
    if (!appId || !appSecret) {
        throw new Error('ZKTLS_APP_ID and ZKTLS_APP_SECRET must be set in .env');
    }
    it('generate', async () => {
        try {
            const zkTLS = new PrimusCoreTLS();
            const result = await zkTLS.init(appId, appSecret);
            console.log("-------------init result=", result);
            
            let request = {
                url: "https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=bitcoin&names=Bitcoin&symbols=btc&include_last_updated_at=true",
                method: "GET",
                header: {
                    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
                },
                body: "",
            };
            
            const responseResolves = [{
                keyName: "bitcoinusd",
                parseType: "json",
                parsePath: "$.bitcoin.usd"
            }]
            const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves);

            generateRequestParamsRes.setAttMode({
                algorithmType: "mpctls",
                resultType: "plain"
            });

            const attestation = await zkTLS.startAttestation(generateRequestParamsRes);
            console.log("attestation=", attestation);
            console.log("attestation.data=", attestation.data);
            const verifyAttestationRes = zkTLS.verifyAttestation(attestation)
            console.log("verifyAttestationRes=", verifyAttestationRes);
        } catch (e) {
            console.log('-----------generate error =',  e);
        }
        
    });
  
});