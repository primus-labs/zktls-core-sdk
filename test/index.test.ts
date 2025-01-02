import { PrimusCoreTLS} from '../src/index';

describe('listData function', () => {
    jest.setTimeout(50000);
    
    const appId = "0x899dd126268e3010beaa1ac141a2a0aa98deba09";
    const appSecret = "0x7da5d1cd2fdd494aa1176031151a6202734e30ddb14fd01dc3376616408ee0a7";
    it('init', async () => {
        const zkTLS = new PrimusCoreTLS();
        const result = await zkTLS.init(appId, appSecret);
        console.log("-------------test result=", result);
    });
  
  });
