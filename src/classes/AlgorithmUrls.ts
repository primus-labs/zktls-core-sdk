import { sendRequest, getInstanceProperties } from '../utils'
import { BASE_SERVICE_URL, PRIMUS_PROXY_URL, PROXY_URL, PRIMUS_MPC_URL} from '../config/env'
export class AlgorithmUrls {
  
  primusMpcUrl: string; // PADOURL
  primusProxyUrl: string;// ZKPADOURL
  proxyUrl: string; // PROXYURL

  constructor() {
    this.primusMpcUrl = PRIMUS_MPC_URL
    this.primusProxyUrl = PRIMUS_PROXY_URL
    this.proxyUrl = PROXY_URL
    this.fetchNodes()
  }
  async fetchNodes() {
    const fetNodesUrl = `${BASE_SERVICE_URL}/public/algo/nodes`
    // console.time('speedTest')
    const res = await sendRequest(fetNodesUrl)
    const that = this
    if (res?.rc === 0) {
      // console.log('-------after fetchNodes result=', res.result);
      let isInited = false;
      res.result.forEach((item: any) => {
        let ws = new WebSocket(`wss://${item.algoProxyDomain}/algoproxyV2`);
        ws.onopen = async function () {
          // console.log('-------updateAlgoUrl onopen url=', item.algoProxyDomain);
          if (!isInited) {
            console.log('-------updateAlgoUrl onopen update url new',item.algorithmDomain);
            that.primusMpcUrl = `wss://${item.algorithmDomain}/algorithmV2`;
            that.primusProxyUrl = `wss://${item.algorithmDomain}/algorithm-proxyV2`;
            that.proxyUrl = `wss://${item.algoProxyDomain}/algoproxyV2`;
            isInited = true;
            // console.timeEnd('speedTest')
          }
          ws.close();
        };
        // ws.onerror = function () {
          // console.log('-------updateAlgoUrl ws onerror', e);
        // };
        // ws.onclose = function () {
          // console.log('-------updateAlgoUrl ws onclose', e);
        // };
      });
    }
  }
  toJsonString() {
    return JSON.stringify(getInstanceProperties(this));
  }
}





