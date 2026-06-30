import type { AttConditions, AttMode, AttModeInput, AttNetworkRequest, AttNetworkResponseResolve, BaseAttestationParams, AttSslCipher} from '../index.d'
import { getInstanceProperties } from '../utils'
import { normalizeRequestId } from '../utils/requestId'

export class AttRequest {
  appId: string;
  request?: AttNetworkRequest | AttNetworkRequest[];
  responseResolves?: AttNetworkResponseResolve[] | AttNetworkResponseResolve[][];
  userAddress: string;
  timestamp: number;
  requestid?: string;
  
  attMode?: AttMode;
  attConditions?: AttConditions;
  additionParams?: string;
  extendedParams?: string;
  sslCipher?: AttSslCipher;
  noProxy?: boolean;
  requestInterval?: number; // in milliseconds

  constructor(baseAttestationParams: BaseAttestationParams) {
    const {
      appId,
      userAddress,
      request,
      responseResolves,
      requestid,
      attMode,
      attConditions,
      additionParams,
      extendedParams,
      sslCipher,
      noProxy,
      requestInterval,
    } = baseAttestationParams
    this.appId = appId
    this.userAddress = userAddress
    this.timestamp = + new Date()
    this.requestid = normalizeRequestId(requestid)
    this.attMode = attMode
      ? {
        algorithmType: attMode.algorithmType,
        resultType: attMode.resultType ?? 'plain'
      }
      : {
        algorithmType: 'proxytls',
        resultType: 'plain'
      }
    this.request = request
    this.responseResolves = responseResolves
    this.attConditions = attConditions
    this.additionParams = additionParams
    this.extendedParams = extendedParams
    this.sslCipher = sslCipher ?? "ECDHE-RSA-AES128-GCM-SHA256";
    this.noProxy = noProxy ?? true;
    this.requestInterval = requestInterval ?? -1;
  }
  setAdditionParams(additionParams: string) {
    this.additionParams = additionParams
  }
  setExtendedParams(extendedParams: string) {
    this.extendedParams = extendedParams
  }
  setAttMode({ algorithmType, resultType = 'plain' }: AttModeInput) {
    this.attMode = {
      algorithmType,
      resultType,
    };
  }
  setAttConditions(attConditions: AttConditions) {
    this.attConditions = attConditions
  }
  setSslCipher(sslCipher :AttSslCipher) {
    this.sslCipher = sslCipher;
  }
  setNoProxy(noProxy: boolean) {
    this.noProxy = noProxy
  }
  setRequestInterval(requestInterval: number) {
    this.requestInterval = requestInterval;
  }
  setRequestId(requestid: string) {
    this.requestid = normalizeRequestId(requestid);
  }
  toJsonString() {
    return JSON.stringify(getInstanceProperties(this));
  }
}



