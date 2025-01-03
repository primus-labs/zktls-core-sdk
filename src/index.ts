import { ethers } from 'ethers';
import { PADOADDRESS } from "./config/constants";
import { AttNetworkRequest, AttNetworkResponseResolve, SignedAttRequest, Attestation } from './index.d'
// import { ZkAttestationError } from './error'
import { AttRequest } from './classes/AttRequest'
import { encodeAttestation } from "./utils";
import { init, getAttestation, getAttestationResult } from "./primus_zk";
import { assemblyParams } from 'assembly_params';

class PrimusCoreTLS {
  appId: string;
  appSecret?: string;

  constructor() {
    this.appId = '';
    this.appSecret= '';
  }

  init(appId: string, appSecret: string): Promise<string | boolean> {
    this.appId = appId
    this.appSecret = appSecret
    return init();
  }

  generateRequestParams(request: AttNetworkRequest, 
    reponseResolve: AttNetworkResponseResolve[], 
    userAddress?: string): AttRequest {
    const userAddr = userAddress? userAddress: "0x7ab44DE0156925fe0c24482a2cDe48C465e47573";
    return new AttRequest({
      appId: this.appId,
      request,
      reponseResolve,
      userAddress: userAddr
    })
  }

  async sign(signParams: string): Promise<SignedAttRequest> {
    if (this.appSecret) {
      const wallet = new ethers.Wallet(this.appSecret);
      const messageHash = ethers.utils.keccak256(new TextEncoder().encode(signParams));
      const sig = await wallet.signMessage(messageHash);
      const result: SignedAttRequest = {
        attRequest: JSON.parse(signParams),
        appSignature: sig
      };
      return result;
    } else {
      throw new Error("Must pass appSecret");
    }
  }

  async startAttestation(attRequest: AttRequest): Promise<Attestation> {
    try {
      const signedAttRequest = await this.sign(attRequest.toJsonString());
      const attParams = assemblyParams(signedAttRequest);
      const attStartRes = await getAttestation(attParams);
      const res = await getAttestationResult();
      console.log("startAttestation res=", res);
    } catch (e: any) {
      return Promise.reject(e)
    }
  }

  verifyAttestation(attestation: Attestation): boolean {
    const encodeData = encodeAttestation(attestation);
    const signature = attestation.signatures[0];
    const result = ethers.utils.recoverAddress(encodeData, signature);
    console.log("sdk verifyAttestation recover address is ", result);
    const verifyResult = PADOADDRESS.toLowerCase() === result.toLowerCase();
    return verifyResult
  }

  // _verifyAttestationParams(attestationParams: SignedAttRequest): boolean {
  //   const { attRequest: { appId,
  //     attTemplateID,
  //     userAddress, timestamp }, appSignature } = attestationParams
  //   const checkFn = (label: string, value: any, valueType: string) => {
  //     if (!value) {
  //       throw new ZkAttestationError('00005', `Missing ${label}!`)
  //     } else {
  //       if (typeof value !== valueType) {
  //         throw new ZkAttestationError('00005', `Wrong ${label}!`)
  //       }
  //     }
  //   }
  //   checkFn('appId', appId, 'string')
  //   checkFn('attTemplateID', attTemplateID, 'string')
  //   checkFn('userAddress', userAddress, 'string')
  //   checkFn('timestamp', timestamp, 'number')
  //   checkFn('appSignature', appSignature, 'string')
  //   return true
  // }

}

export { PrimusCoreTLS };