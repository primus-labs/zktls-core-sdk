import { ethers } from 'ethers';
import { PADOADDRESS } from './config/constants'
import { AttNetworkRequest, AttNetworkResponseResolve, SignedAttRequest, Attestation } from './index.d'
import { AttRequest } from './classes/AttRequest'
import { AlgorithmUrls } from "./classes/AlgorithmUrls";
import { encodeAttestation } from "./utils";
import { init, getAttestation, getAttestationResult, AlgorithmBackend } from "./primus_zk";
import { assemblyParams } from './assembly_params';
import { ZkAttestationError } from './classes/Error'
import { AttestationErrorCode } from 'config/error';
import { eventReport, ClientType } from './utils/eventReport'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../package.json') as { name: string; version: string };

class PrimusCoreTLS {
  appId: string;
  appSecret?: string;
  algoUrls: AlgorithmUrls

  constructor() {
    this.appId = '';
    this.appSecret = '';
    this.algoUrls = new AlgorithmUrls()
  }

  async init(appId: string, appSecret: string, mode: AlgorithmBackend = 'auto'): Promise<string | boolean> {
    this.appId = appId
    this.appSecret = appSecret
    return await init(mode);
  }

  generateRequestParams(request: AttNetworkRequest | AttNetworkRequest[],
    responseResolves: AttNetworkResponseResolve[] | AttNetworkResponseResolve[][],
    userAddress?: string): AttRequest {
    const userAddr = userAddress ? userAddress : "0x0000000000000000000000000000000000000000";
    return new AttRequest({
      appId: this.appId,
      request,
      responseResolves,
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

  async startAttestation(attRequest: AttRequest, timeout: number = 2 * 60 * 1000): Promise<any> {
    const eventReportBaseParams = {
      source: "",
      clientType: packageJson.name as ClientType,
      appId: attRequest.appId,
      templateId: "",
      address: attRequest.userAddress,
      ext: {}
    }
    try {
      const signParams = attRequest.toJsonString()
      const signedAttRequest = await this.sign(signParams);
      const attParams = assemblyParams(signedAttRequest, this.algoUrls);
      const getAttestationRes = await getAttestation(attParams);
      
      if (getAttestationRes.retcode !== "0") {
        const errorCode = getAttestationRes.retcode === '2' ? '00001' : '00000';
        await eventReport({
          ...eventReportBaseParams,
          status: "FAILED",
          detail: {
            code: errorCode,
            desc: ""
          },
        })
        return Promise.reject(new ZkAttestationError(errorCode))
      }
      const res: any = await getAttestationResult(timeout);
      const { retcode, content, details } = res
      if (retcode === '0') {
        const { balanceGreaterThanBaseValue, signature, encodedData, extraData } = content
        if (balanceGreaterThanBaseValue === 'true' && signature) {
          await eventReport({
            ...eventReportBaseParams,
            status: "SUCCESS",
          })
          return Promise.resolve(JSON.parse(encodedData))
        } else if (!signature || balanceGreaterThanBaseValue === 'false') {
          let errorCode;
          if (
            extraData &&
            JSON.parse(extraData) &&
            ['-1200010', '-1002001', '-1002002', '-1002003', '-1002004', '-1002005'].includes(
              JSON.parse(extraData).errorCode + ''
            )
          ) {
            errorCode = JSON.parse(extraData).errorCode + '';
          } else {
            errorCode = '00104';
          }
          await eventReport({
            ...eventReportBaseParams,
            status: "FAILED",
            detail: {
              code: errorCode,
              desc: ""
            },
          })
         
          return Promise.reject(new ZkAttestationError(errorCode as AttestationErrorCode, '', res))
        }
      } else if (retcode === '2') {
        const { errlog: { code } } = details;
        await eventReport({
          ...eventReportBaseParams,
          status: "FAILED",
          detail: {
            code,
            desc: ""
          },
        })
        return Promise.reject(new ZkAttestationError(code, '', res))
      }
    } catch (e: any) {
      if (e?.code === 'timeout') {
        await eventReport({
          ...eventReportBaseParams,
          status: "FAILED",
          detail: {
            code: '00002',
            desc: ""
          },
          ext: {
            getAttestationResultRes: JSON.stringify(e.data)
          }
        })
        return Promise.reject(new ZkAttestationError('00002', '', e.data))
      } else {
        return Promise.reject(e)
      }
    }
  }

  verifyAttestation(attestation: Attestation): boolean {
    const encodeData = encodeAttestation(attestation);
    const signature = attestation.signatures[0];
    const result = ethers.utils.recoverAddress(encodeData, signature);
    const verifyResult = PADOADDRESS.toLowerCase() === result.toLowerCase();
    return verifyResult
  }

}

export { PrimusCoreTLS, Attestation };