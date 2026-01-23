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
  private _isAttesting: boolean = false;

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

  private _validateAttestationParams(attRequest: AttRequest, timeout: number): void {
    // Validate attRequest exists
    if (!attRequest) {
      throw new ZkAttestationError('00005', 'Missing attRequest parameter')
    }

    // Validate appId
    if (!attRequest.appId || typeof attRequest.appId !== 'string' || attRequest.appId.trim() === '') {
      throw new ZkAttestationError('00005', 'Missing or invalid appId')
    }

    // Validate userAddress
    if (!attRequest.userAddress || typeof attRequest.userAddress !== 'string' || attRequest.userAddress.trim() === '') {
      throw new ZkAttestationError('00005', 'Missing or invalid userAddress')
    }

    // Validate userAddress format (Ethereum address)
    if (!ethers.utils.isAddress(attRequest.userAddress)) {
      throw new ZkAttestationError('00005', 'Invalid userAddress format')
    }

    // Validate timeout
    if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
      throw new ZkAttestationError('00005', 'Invalid timeout parameter')
    }

    // Validate request if provided
    if (attRequest.request !== undefined) {
      const validateRequest = (req: AttNetworkRequest) => {
        if (!req || typeof req !== 'object') {
          throw new ZkAttestationError('00005', 'Invalid request object')
        }
        if (!req.url || typeof req.url !== 'string' || req.url.trim() === '') {
          throw new ZkAttestationError('00005', 'Missing or invalid request.url')
        }
        if (!req.method || typeof req.method !== 'string' || req.method.trim() === '') {
          throw new ZkAttestationError('00005', 'Missing or invalid request.method')
        }
      }

      if (Array.isArray(attRequest.request)) {
        if (attRequest.request.length === 0) {
          throw new ZkAttestationError('00005', 'Request array cannot be empty')
        }
        attRequest.request.forEach((req, index) => {
          try {
            validateRequest(req)
          } catch (error: any) {
            throw new ZkAttestationError('00005', `Invalid request at index ${index}: ${error.message || error}`)
          }
        })
      } else {
        validateRequest(attRequest.request)
      }
    }

    // Validate responseResolves if provided
    if (attRequest.responseResolves !== undefined) {
      const validateResponseResolve = (resolve: AttNetworkResponseResolve) => {
        if (!resolve || typeof resolve !== 'object') {
          throw new ZkAttestationError('00005', 'Invalid responseResolve object')
        }
        if (!resolve.keyName || typeof resolve.keyName !== 'string' || resolve.keyName.trim() === '') {
          throw new ZkAttestationError('00005', 'Missing or invalid responseResolve.keyName')
        }
        if (!resolve.parsePath || typeof resolve.parsePath !== 'string' || resolve.parsePath.trim() === '') {
          throw new ZkAttestationError('00005', 'Missing or invalid responseResolve.parsePath')
        }
      }

      if (Array.isArray(attRequest.responseResolves)) {
        if (attRequest.responseResolves.length === 0) {
          throw new ZkAttestationError('00005', 'ResponseResolves array cannot be empty')
        }
        // Check if it's a nested array (AttNetworkResponseResolve[][])
        const firstItem = attRequest.responseResolves[0]
        if (Array.isArray(firstItem)) {
          // Nested array case
          (attRequest.responseResolves as AttNetworkResponseResolve[][]).forEach((resolveArray, arrayIndex) => {
            if (!Array.isArray(resolveArray) || resolveArray.length === 0) {
              throw new ZkAttestationError('00005', `ResponseResolves array at index ${arrayIndex} is invalid`)
            }
            resolveArray.forEach((resolve, resolveIndex) => {
              try {
                validateResponseResolve(resolve)
              } catch (error: any) {
                throw new ZkAttestationError('00005', `Invalid responseResolve at [${arrayIndex}][${resolveIndex}]: ${error.message || error}`)
              }
            })
          })
        } else {
          // Flat array case (AttNetworkResponseResolve[])
          (attRequest.responseResolves as AttNetworkResponseResolve[]).forEach((resolve, index) => {
            try {
              validateResponseResolve(resolve)
            } catch (error: any) {
              throw new ZkAttestationError('00005', `Invalid responseResolve at index ${index}: ${error.message || error}`)
            }
          })
        }
      }
    }
  }

  async startAttestation(attRequest: AttRequest, timeout: number = 2 * 60 * 1000): Promise<any> {
    // Validate parameters
    try {
      this._validateAttestationParams(attRequest, timeout)
    } catch (error: any) {
      return Promise.reject(error)
    }
    // Check if there's already an attestation in progress
    if (this._isAttesting) {
      const errorCode = '00003';
      return Promise.reject(new ZkAttestationError(errorCode))
    }

    // Set attestation flag
    this._isAttesting = true;

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
    } finally {
      // Always clear the attestation flag when done
      this._isAttesting = false;
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