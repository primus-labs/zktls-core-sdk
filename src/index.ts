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
import { getAppQuote } from './api';

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
    try {
      // Check app quote before starting attestation
      // Only business logic errors (ZkAttestationError) will be thrown
      // Network errors will be caught and logged, but won't stop execution
      await this._checkAppQuote();

      const signParams = attRequest.toJsonString()
      const signedAttRequest = await this.sign(signParams);
      const attParams = assemblyParams(signedAttRequest, this.algoUrls);
      const getAttestationRes = await getAttestation(attParams);
      if (getAttestationRes.retcode !== "0") {
        return Promise.reject(new ZkAttestationError('00001'))
      }
      const res: any = await getAttestationResult(timeout);
      const { retcode, content, details } = res
      if (retcode === '0') {
        const { balanceGreaterThanBaseValue, signature, encodedData, extraData } = content
        if (balanceGreaterThanBaseValue === 'true' && signature) {
          return Promise.resolve(JSON.parse(encodedData))
        } else if (!signature || balanceGreaterThanBaseValue === 'false') {
          let errorCode;
          if (
            extraData &&
            JSON.parse(extraData) &&
            ['-1200010', '-1002001', '-1002002'].includes(
              JSON.parse(extraData).errorCode + ''
            )
          ) {
            errorCode = JSON.parse(extraData).errorCode + '';
          } else {
            errorCode = '00104';
          }
          return Promise.reject(new ZkAttestationError(errorCode as AttestationErrorCode, '', res))
        }
      } else if (retcode === '2') {
        const { errlog: { code } } = details;
        return Promise.reject(new ZkAttestationError(code, '', res))
      }
    } catch (e: any) {
      if (e?.code === 'timeout') {
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

  /**
   * Check app quote and perform business logic based on the result
   * @private
   * @throws {ZkAttestationError} Only throws business logic errors, network errors are caught and ignored
   */
  private async _checkAppQuote(): Promise<void> {
    try {
      const {rc, result} = await getAppQuote({ appId: this.appId });
      // console.log('_checkAppQuote', result)
      // Business logic based on quote result
      if (rc !== 0) {
        // Handle error case - you can customize this based on your requirements
        console.warn('App quote check failed:', result?.msg);
        // Optionally throw error or handle differently based on business requirements
        // throw new ZkAttestationError('00005', result?.msg || 'App quote check failed');
      }
      if (!result ) { 
        throw new ZkAttestationError('-1002001');
      }
      if (!result.expiryTime && (!result.remainingQuota  || result.remainingQuota <= 0 ) ) {
        throw new ZkAttestationError('-1002003');
      }
      if (result.expiryTime ) {
        if (result.expiryTime < Date.now()) {
          throw new ZkAttestationError('-1002004');
        }
        if (!result.remainingQuota || result.remainingQuota <= 0) {
          throw new ZkAttestationError('-1002005');
        }
      }
      
      // Add other business logic based on quoteResult.result if needed
      // For example:
      // if (quoteResult.result?.quotaExceeded) {
      //   throw new ZkAttestationError('00005', 'Quota exceeded');
      // }
    } catch (error: any) {
      // If it's a business logic error (ZkAttestationError), rethrow it
      if (error instanceof ZkAttestationError) {
        throw error;
      }
      // For network errors or other exceptions, catch and log but don't throw
      // This allows the execution to continue even if the quote check fails
      console.error('Failed to check app quote (network error or other exception):', error);
      // Don't throw - allow execution to continue
    }
  }
}

export { PrimusCoreTLS, Attestation };