//import { ethers } from 'ethers';
//import { /*ATTESTATIONPOLLINGTIME, ATTESTATIONPOLLINGTIMEOUT,*/ PADOADDRESSMAP } from "./config/constants";
//import { /*Attestation,*/ Env, /*SignedAttRequest*/ } from './index.d'
// import { ZkAttestationError } from './error'
// import { AttRequest } from './classes/AttRequest'
// import { encodeAttestation } from "./utils";
import { init } from "./primus_zk";

class PrimusCoreTLS {
  //private _env: Env;
  //private _padoAddress: string;

  isInstalled?: boolean;
  isInitialized: boolean;
  //padoExtensionVersion: string;

  appId: string;
  appSecret?: string;

  constructor() {
    this.isInitialized = false;
    //this._env = 'production';
    //this._padoAddress = (PADOADDRESSMAP as any)[this._env];
    this.appId = '';
    this.appSecret= '';
  }

  init(appId: string, appSecret: string): Promise<string | boolean> {
    this.appId = appId
    this.appSecret = appSecret
    return init();
  }

//   generateRequestParams(attTemplateID: string, userAddress: string): AttRequest {
//     return new AttRequest({
//       appId: this.appId,
//       attTemplateID,
//       userAddress
//     })
//   }

//   async sign(signParams: string): Promise<string> {
//     if (this.appSecret) {
//       const wallet = new ethers.Wallet(this.appSecret);
//       const messageHash = ethers.utils.keccak256(new TextEncoder().encode(signParams));
//       const sig = await wallet.signMessage(messageHash);
//       const result: SignedAttRequest = {
//         attRequest: JSON.parse(signParams),
//         appSignature: sig
//       };
//       return JSON.stringify(result);
//     } else {
//       throw new Error("Only call in App server environment.");
//     }
//   }

//   async startAttestation(attestationParamsStr: string): Promise<Attestation> {
//     if (!this.isInitialized) {
//       const errorCode = '00001'
//       return Promise.reject(new ZkAttestationError(errorCode))
//     }
//     // if (this._attestLoading) {
//     //   const errorCode = '00003'
//     //   return Promise.reject(new ZkAttestationError(errorCode))
//     // }
//     // this._attestLoading = true

//     try {
//       const attestationParams = JSON.parse(attestationParamsStr) as SignedAttRequest;
//       this._verifyAttestationParams(attestationParams);
//       let formatParams: any = { ...attestationParams,sdkVersion: packageJson.version }

//       window.postMessage({
//         target: "padoExtension",
//         origin: "padoZKAttestationJSSDK",
//         name: "startAttestation",
//         params: formatParams,
//       });
//       console.time('startAttestCost')
//       return new Promise((resolve, reject) => {
//         let pollingTimer: any
//         let timeoutTimer: any
//         const eventListener = async (event: any) => {
//           const { target, name, params } = event.data;
//           if (target === "padoZKAttestationJSSDK") {
//             if (name === "getAttestationRes") {
//               console.log('sdk receive getAttestationRes', params)
//               const { result, errorData } = params
//               if (result) {
//                 timeoutTimer = setTimeout(() => {
//                   if (pollingTimer) {
//                     clearInterval(pollingTimer)
//                     // this._attestLoading = false
//                     window.postMessage({
//                       target: "padoExtension",
//                       origin: "padoZKAttestationJSSDK",
//                       name: "getAttestationResultTimeout",
//                       params: {}
//                     });
//                   }
//                 }, ATTESTATIONPOLLINGTIMEOUT)
//                 pollingTimer = setInterval(() => {
//                   window.postMessage({
//                     target: "padoExtension",
//                     origin: "padoZKAttestationJSSDK",
//                     name: "getAttestationResult",
//                     params: {}
//                   });
//                 }, ATTESTATIONPOLLINGTIME)
//               } else {
//                 // this._attestLoading = false
//                 window?.removeEventListener('message', eventListener);
//                 const { code,data } = errorData
//                 reject(new ZkAttestationError(code, '', data))
//               }
//             }
//             if (name === "startAttestationRes") {
//               const { result, data, errorData } = params
//               console.log('sdk-receive getAttestationResultRes', params)
//               // this._attestLoading = false
//               if (result) {
//                 clearInterval(pollingTimer)
//                 clearTimeout(timeoutTimer)
//                 console.timeEnd('startAttestCost')
//                 window?.removeEventListener('message', eventListener);
//                 const formatParams2 = { ...data }
//                 resolve(formatParams2)
//               } else {
//                 clearInterval(pollingTimer)
//                 clearTimeout(timeoutTimer)
//                 console.timeEnd('startAttestCost')
//                 window?.removeEventListener('message', eventListener);
//                 const { code, data/*desc*/ } = errorData
//                 // if (attestationParams?.attestationTypeID === '101') {
//                 //   reject(new ZkAttestationError(code, desc))
//                 // } else {
//                 reject(new ZkAttestationError(code, '', data))


//                 // if (params.reStartFlag) {
//                 //   await this.initAttestation(this._dappSymbol)
//                 //   console.log('333-reStartFlag')
//                 // }
//               }
//             }
//           }
//         }
//         window.addEventListener("message", eventListener);
//       });

//     } catch (e: any) {
//       // this._attestLoading = false
//       return Promise.reject(e)
//     }
//   }

//   verifyAttestation(attestation: Attestation): boolean {
//     const encodeData = encodeAttestation(attestation);
//     const signature = attestation.signatures[0];
//     const result = ethers.utils.recoverAddress(encodeData, signature);
//     console.log("sdk verifyAttestation recover address is ", result);
//     const verifyResult = this._padoAddress.toLowerCase() === result.toLowerCase();
//     return verifyResult
//   }

//   _verifyAttestationParams(attestationParams: SignedAttRequest): boolean {
//     const { attRequest: { appId,
//       attTemplateID,
//       userAddress, timestamp }, appSignature } = attestationParams
//     const checkFn = (label: string, value: any, valueType: string) => {
//       if (!value) {
//         throw new ZkAttestationError('00005', `Missing ${label}!`)
//       } else {
//         if (typeof value !== valueType) {
//           throw new ZkAttestationError('00005', `Wrong ${label}!`)
//         }
//       }
//     }
//     checkFn('appId', appId, 'string')
//     checkFn('attTemplateID', attTemplateID, 'string')
//     checkFn('userAddress', userAddress, 'string')
//     checkFn('timestamp', timestamp, 'number')
//     checkFn('appSignature', appSignature, 'string')
//     return true
//   }

}

export { PrimusCoreTLS };