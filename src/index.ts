import { ethers } from 'ethers';
import { PADO_ADDRESS } from './config/env'
import {
  AttNetworkRequest,
  AttNetworkResponseResolve,
  FullAttestationParams,
  SignedAttRequest,
  StartAttestationInput,
  Attestation,
  PrimusInitOptions,
  StartAttestationOptions,
  AttestationProgressEvent,
  GenerateRequestParamsOptions,
} from './index.d'
import { AttRequest } from './classes/AttRequest'
import { AlgorithmUrls } from "./classes/AlgorithmUrls";
import { encodeAttestation } from "./utils";
import {
  init,
  getAttestation,
  getAttestationResult,
  AlgorithmBackend,
} from "./primus_zk";
import { ProcessAlgorithmPool } from './algorithm/ProcessAlgorithmPool';
import { assemblyParams } from './assembly_params';
import { ZkAttestationError } from './classes/Error'
import { ALGO_ERR_NORMALIZE_TO_50000, AttestationErrorCode } from './config/error';
import { getAppQuote } from './api';
import { eventReport } from './utils/eventReport'
import { safeJsonParse } from './utils/safeJsonParse';
import { ClientType, EventReportRawData } from './api/index.d';

const KNOWN_EXTRA_DATA_ERROR_CODES = new Set([
  '-1200010',
  '-1002001',
  '-1002002',
  '-1002003',
  '-1002004',
  '-1002005',
]);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../package.json') as { name: string; version: string };

function buildEventReportCode(code: string, subCode: unknown): string {
  if (subCode === undefined || subCode === null || subCode === '') {
    return code;
  }
  return `${code}:${String(subCode)}`;
}

const EVENT_REPORT_SKIP_FAILED_CODES = new Set(['00003', '00004', '00005']);

class PrimusCoreTLS {
  appId: string;
  appSecret?: string;
  algoUrls: AlgorithmUrls
  private _isAttesting: boolean = false;
  private _allPrivateData: Record<string, string> = {};
  private _concurrency: number = 1;
  private _algorithmPool?: ProcessAlgorithmPool;

  constructor() {
    this.appId = '';
    this.appSecret = '';
    this.algoUrls = new AlgorithmUrls()
  }

  private reportEventIfNeeded(rawDataObj: EventReportRawData): void {
    if (rawDataObj.status === 'FAILED') {
      const reportCode = rawDataObj.detail?.code;
      const baseCode = reportCode ? reportCode.split(':')[0] : undefined;
      if (baseCode && EVENT_REPORT_SKIP_FAILED_CODES.has(baseCode)) {
        return;
      }
    }
    void eventReport(rawDataObj);
  }

  async init(
    appId: string,
    appSecret?: string,
    modeOrOptions: AlgorithmBackend | PrimusInitOptions = 'auto'
  ): Promise<string | boolean> {
    this.appId = appId
    this.appSecret = appSecret?.trim() ? appSecret : undefined
    await this.algoUrls.fetchNodes();
    const initOptions = this._resolveInitOptions(modeOrOptions);
    this._concurrency = initOptions.concurrency;
    if (this._algorithmPool) {
      await this._algorithmPool.close();
      this._algorithmPool = undefined;
    }
    if (this._concurrency > 1) {
      this._algorithmPool = new ProcessAlgorithmPool({
        backend: initOptions.backend,
        concurrency: this._concurrency,
        logLevel: initOptions.logLevel,
        logLength: initOptions.logLength,
      });
      return this._algorithmPool.init({
        backend: initOptions.backend,
        logLevel: initOptions.logLevel,
        logLength: initOptions.logLength,
      });
    }
    return await init(initOptions.backend, initOptions.logLevel, initOptions.logLength);
  }

  async close(): Promise<void> {
    if (this._algorithmPool) {
      await this._algorithmPool.close();
      this._algorithmPool = undefined;
    }
  }

  private _resolveInitOptions(modeOrOptions: AlgorithmBackend | PrimusInitOptions): Required<PrimusInitOptions> {
    if (typeof modeOrOptions === 'string') {
      return {
        backend: modeOrOptions,
        concurrency: 1,
        logLevel: 'error',
        logLength: 2048,
      };
    }
    const concurrency = modeOrOptions.concurrency ?? 1;
    const logLength = modeOrOptions.logLength ?? 2048;
    return {
      backend: modeOrOptions.backend ?? 'auto',
      concurrency: Number.isFinite(concurrency) && concurrency > 1 ? Math.floor(concurrency) : 1,
      logLevel: modeOrOptions.logLevel ?? 'error',
      logLength: Number.isFinite(logLength) && logLength > 0 ? Math.floor(logLength) : 2048,
    };
  }

  private _validateRequest(request: AttNetworkRequest, index?: number): void {
    if (!request || typeof request !== 'object') {
      const errorMsg = index !== undefined 
        ? `Invalid request object at index ${index}`
        : 'Invalid request object';
      throw new ZkAttestationError('00005', errorMsg);
    }

    // Validate URL
    if (!request.url || typeof request.url !== 'string' || request.url.trim() === '') {
      const errorMsg = index !== undefined
        ? `Missing or invalid request.url at index ${index}`
        : 'Missing or invalid request.url';
      throw new ZkAttestationError('00005', errorMsg);
    }

    // Validate URL format
    try {
      new URL(request.url.trim());
    } catch (e) {
      const errorMsg = index !== undefined
        ? `Invalid URL format at index ${index}: ${request.url}`
        : `Invalid URL format: ${request.url}`;
      throw new ZkAttestationError('00005', errorMsg);
    }

    // Validate method
    if (!request.method || typeof request.method !== 'string' || request.method.trim() === '') {
      const errorMsg = index !== undefined
        ? `Missing or invalid request.method at index ${index}`
        : 'Missing or invalid request.method';
      throw new ZkAttestationError('00005', errorMsg);
    }

    // Validate HTTP method
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];
    const methodUpper = request.method.trim().toUpperCase();
    if (!validMethods.includes(methodUpper)) {
      const errorMsg = index !== undefined
        ? `Invalid HTTP method at index ${index}: ${request.method}. Valid methods are: ${validMethods.join(', ')}`
        : `Invalid HTTP method: ${request.method}. Valid methods are: ${validMethods.join(', ')}`;
      throw new ZkAttestationError('00005', errorMsg);
    }
  }

  generateRequestParams(
    request: AttNetworkRequest | AttNetworkRequest[],
    responseResolves: AttNetworkResponseResolve[] | AttNetworkResponseResolve[][],
    userAddress?: string
  ): AttRequest;
  generateRequestParams(
    request: AttNetworkRequest | AttNetworkRequest[],
    responseResolves: AttNetworkResponseResolve[] | AttNetworkResponseResolve[][],
    options?: GenerateRequestParamsOptions
  ): AttRequest;
  generateRequestParams(
    request: AttNetworkRequest | AttNetworkRequest[],
    responseResolves: AttNetworkResponseResolve[] | AttNetworkResponseResolve[][],
    userAddressOrOptions?: string | GenerateRequestParamsOptions
  ): AttRequest {
    // Validate request parameter
    if (request === undefined || request === null) {
      throw new ZkAttestationError('00005', 'Missing request parameter');
    }

    if (Array.isArray(request)) {
      if (request.length === 0) {
        throw new ZkAttestationError('00005', 'Request array cannot be empty');
      }
      request.forEach((req, index) => {
        this._validateRequest(req, index);
      });
    } else {
      this._validateRequest(request);
    }

    const options: GenerateRequestParamsOptions =
      typeof userAddressOrOptions === 'string'
        ? { userAddress: userAddressOrOptions }
        : userAddressOrOptions ?? {};
    const userAddr = options.userAddress ?? '0x0000000000000000000000000000000000000000';
    const attRequest = new AttRequest({
      ...options,
      appId: this.appId,
      request,
      responseResolves,
      userAddress: userAddr,
    });
    return attRequest;
  }

  async sign(signParams: string): Promise<string> {
    if (this.appSecret) {
      const wallet = new ethers.Wallet(this.appSecret);
      const messageHash = ethers.utils.keccak256(new TextEncoder().encode(signParams));
      const sig = await wallet.signMessage(messageHash);
      const result: SignedAttRequest = {
        attRequest: JSON.parse(signParams),
        appSignature: sig
      };
      return JSON.stringify(result);
    } else {
      throw new Error("Must pass appSecret");
    }
  }

  private _validateSignedAttRequest(signedAttRequest: SignedAttRequest): void {
    if (!signedAttRequest || typeof signedAttRequest !== 'object') {
      throw new ZkAttestationError('00005', 'Invalid signed attestation parameters')
    }

    const { attRequest, appSignature } = signedAttRequest
    if (!attRequest || typeof attRequest !== 'object') {
      throw new ZkAttestationError('00005', 'Missing attRequest')
    }
    if (!appSignature || typeof appSignature !== 'string' || appSignature.trim() === '') {
      throw new ZkAttestationError('00005', 'Missing or invalid appSignature')
    }
    if (!attRequest.appId || typeof attRequest.appId !== 'string' || attRequest.appId.trim() === '') {
      throw new ZkAttestationError('00005', 'Missing or invalid appId')
    }
    if (typeof attRequest.timestamp !== 'number' || !Number.isFinite(attRequest.timestamp)) {
      throw new ZkAttestationError('00005', 'Missing or invalid timestamp')
    }
    if (!attRequest.userAddress || typeof attRequest.userAddress !== 'string' || attRequest.userAddress.trim() === '') {
      throw new ZkAttestationError('00005', 'Missing or invalid userAddress')
    }
  }

  private async _resolveSignedAttRequest(input: StartAttestationInput): Promise<SignedAttRequest> {
    if (typeof input === 'string') {
      try {
        const signedAttRequest = JSON.parse(input) as SignedAttRequest
        this._validateSignedAttRequest(signedAttRequest)
        return signedAttRequest
      } catch (error: unknown) {
        if (error instanceof ZkAttestationError) {
          throw error
        }
        throw new ZkAttestationError('00005', 'Invalid signed attestation JSON string')
      }
    }

    if (!input || typeof input.toJsonString !== 'function') {
      throw new ZkAttestationError('00005', 'Invalid attestation input')
    }

    const signedAttRequest = JSON.parse(await this.sign(input.toJsonString())) as SignedAttRequest
    this._validateSignedAttRequest(signedAttRequest)
    return signedAttRequest
  }

  private _validateAttestationParams(
    attRequest: AttRequest | FullAttestationParams,
    timeout: number,
    algoUrls?: unknown
  ): void {
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

    // Validate algoUrls when provided (same shape as AlgorithmUrls: three non-empty parseable URLs)
    if (algoUrls !== undefined && algoUrls !== null) {
      if (!this._isValidAlgoUrlsLike(algoUrls)) {
        throw new ZkAttestationError(
          '00005',
          'Invalid algoUrls: primusMpcUrl, primusProxyUrl, and proxyUrl must be non-empty strings and valid URLs'
        )
      }
    }

    // Validate request if provided
    if (attRequest.request !== undefined) {
      if (Array.isArray(attRequest.request)) {
        if (attRequest.request.length === 0) {
          throw new ZkAttestationError('00005', 'Request array cannot be empty')
        }
        attRequest.request.forEach((req, index) => {
          try {
            this._validateRequest(req, index)
          } catch (error: any) {
            throw new ZkAttestationError('00005', `Invalid request at index ${index}: ${error.message || error}`)
          }
        })
      } else {
        try {
          this._validateRequest(attRequest.request)
        } catch (error: any) {
          throw new ZkAttestationError('00005', `Invalid request: ${error.message || error}`)
        }
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

  /** Same shape as {@link AlgorithmUrls}: primusMpcUrl, primusProxyUrl, proxyUrl (non-empty, parseable URLs). */
  private _isValidAlgoUrlsLike(
    value: unknown
  ): value is Pick<AlgorithmUrls, 'primusMpcUrl' | 'primusProxyUrl' | 'proxyUrl'> {
    if (value === null || typeof value !== 'object') {
      return false
    }
    const o = value as Record<string, unknown>
    for (const key of ['primusMpcUrl', 'primusProxyUrl', 'proxyUrl'] as const) {
      const s = o[key]
      if (typeof s !== 'string' || s.trim() === '') {
        return false
      }
      try {
        new URL(s.trim())
      } catch {
        return false
      }
    }
    return true
  }

  /** Caller must pass `algoUrls` through {@link _validateAttestationParams} first when provided. */
  private _resolveAlgoUrlsOverride(algoUrlsOverride?: unknown): AlgorithmUrls {
    if (algoUrlsOverride === undefined || algoUrlsOverride === null) {
      return this.algoUrls
    }
    return algoUrlsOverride as AlgorithmUrls
  }

  async startAttestation(
    input: StartAttestationInput,
    timeout?: number,
    algoUrls?: Pick<AlgorithmUrls, 'primusMpcUrl' | 'primusProxyUrl' | 'proxyUrl'>
  ): Promise<any>;
  async startAttestation(
    input: StartAttestationInput,
    options?: StartAttestationOptions
  ): Promise<any>;
  async startAttestation(
    input: StartAttestationInput,
    timeoutOrOptions: number | StartAttestationOptions = 2 * 60 * 1000,
    positionalAlgoUrls?: Pick<AlgorithmUrls, 'primusMpcUrl' | 'primusProxyUrl' | 'proxyUrl'>
  ): Promise<any> {
    const startOptions = this._resolveStartAttestationOptions(timeoutOrOptions, positionalAlgoUrls);
    const { timeout, algoUrls } = startOptions;
    let signedAttRequest: SignedAttRequest
    try {
      signedAttRequest = await this._resolveSignedAttRequest(input)
      this._validateAttestationParams(signedAttRequest.attRequest, timeout, algoUrls)
    } catch (error: any) {
      return Promise.reject(error)
    }
    const { attRequest } = signedAttRequest
    const effectiveAlgoUrls = this._resolveAlgoUrlsOverride(algoUrls)
    // Check if there's already an attestation in progress
    if (this._concurrency <= 1 && this._isAttesting) {
      const errorCode = '00003';
      return Promise.reject(new ZkAttestationError(errorCode))
    }

    // Set attestation flag
    if (this._concurrency <= 1) {
      this._isAttesting = true;
    }

    let currentRequestId = '';
    const eventReportBaseParams = {
      source: "",
      clientType: packageJson.name as ClientType,
      appId: attRequest.appId,
      templateId: "",
      address: attRequest.userAddress,
      ext: {}
    }
    try {
      // Check app quote before starting attestation
      // Only business logic errors (ZkAttestationError) will be thrown
      // Network errors will be caught and logged, but won't stop execution
      await this._checkAppQuote();

      // console.log('signedAttRequest====', JSON.stringify(signedAttRequest));
      const attParams = {
        ...assemblyParams(signedAttRequest, effectiveAlgoUrls, startOptions),
        stream: startOptions.stream,
      };
      currentRequestId = attParams.requestid;
      if (input instanceof AttRequest) {
        input.requestid = attParams.requestid;
      }
      let getAttestationRes: any = { retcode: '0' };
      let res: any;
      if (this._algorithmPool) {
        const poolResult = await this._algorithmPool.runAttestation(attParams, {
          timeout,
          pollIntervalMs: startOptions.pollIntervalMs,
          onResult: (result) => this._handleAlgorithmProgress(result, attParams.requestid, startOptions),
        });
        const normalizedPoolResult = this._normalizeAlgorithmPoolResult(poolResult);
        if (normalizedPoolResult.phase === 'start') {
          getAttestationRes = normalizedPoolResult.result;
        } else {
          res = normalizedPoolResult.result;
        }
      } else {
        getAttestationRes = await getAttestation(attParams, {
          onStream: (result) => this._handleAlgorithmProgress(result, attParams.requestid, startOptions),
        });
      }
      
      if (getAttestationRes.retcode !== "0") {
        const errorCode = getAttestationRes.retcode === '2' ? '00001' : '00000';
        this.reportEventIfNeeded({
          ...eventReportBaseParams,
          status: "FAILED",
          detail: {
            code: errorCode,
            desc: ""
          },
          ext: {
            getAttestationRes: JSON.stringify(getAttestationRes)
          }
        })
        const startError = new ZkAttestationError(errorCode);
        await this._emitProgressIfNeeded(startOptions, {
          type: 'error',
          requestId: currentRequestId,
          error: startError,
        });
        return Promise.reject(startError)
      }
      if (!this._algorithmPool) {
        res = await getAttestationResult({
          timeout,
          pollIntervalMs: startOptions.pollIntervalMs,
        });
      }
      const { retcode, content, details } = res
      if (retcode === '0') {
        const { balanceGreaterThanBaseValue, signature, encodedData, extraData, privateData } = content
        if (balanceGreaterThanBaseValue === 'true' && signature) {
          if (
            typeof privateData === 'string' &&
            typeof attParams.requestid === 'string' &&
            attParams.requestid.trim() !== ''
          ) {
            this._allPrivateData[attParams.requestid] = privateData;
          }
          await this._emitProgressIfNeeded(startOptions, {
            type: 'proof-ready',
            requestId: attParams.requestid,
          });
          this.reportEventIfNeeded({
            ...eventReportBaseParams,
            status: "SUCCESS",
          })
          const parsedEncodedData = safeJsonParse(encodedData, {
            field: 'encodedData',
            fallbackCode: '99999',
            data: res,
          });
          return Promise.resolve(parsedEncodedData)
        } else if (!signature || balanceGreaterThanBaseValue === 'false') {
          let errorCode: AttestationErrorCode = '00104';
          if (typeof extraData === 'string' && extraData.trim() !== '') {
            const parsedExtraData = safeJsonParse<{ errorCode?: unknown }>(extraData, {
              field: 'extraData',
              fallbackCode: '99999',
              data: res,
            });
            const rawErrorCode =
              parsedExtraData?.errorCode != null ? String(parsedExtraData.errorCode) : '';
            if (KNOWN_EXTRA_DATA_ERROR_CODES.has(rawErrorCode)) {
              errorCode = rawErrorCode as AttestationErrorCode;
            }
          }
          this.reportEventIfNeeded({
            ...eventReportBaseParams,
            status: "FAILED",
            detail: {
              code: errorCode,
              desc: ""
            },
            ext: {
              getAttestationResultRes: JSON.stringify(res)
            }
          })

          const proofError = new ZkAttestationError(errorCode as AttestationErrorCode, '', res);
          await this._emitProgressIfNeeded(startOptions, {
            type: 'error',
            requestId: currentRequestId,
            error: proofError,
          });
          return Promise.reject(proofError)
        }
      } else if (retcode === '2') {
        const { errlog: { code: rawCode, desc: detailsDesc } = {} } = details || {};
        const rawNum = rawCode != null && rawCode !== '' ? Number(rawCode) : NaN;
        const mapped50000Sub = ALGO_ERR_NORMALIZE_TO_50000[rawNum];
        let resolvedCode =
          rawCode != null && String(rawCode).trim() !== '' ? String(rawCode) : '99999:001';
        let resolvedSubCode: string | undefined;
        if (mapped50000Sub !== undefined) {
          resolvedCode = `50000:${mapped50000Sub}`;
        } else if (rawNum === 30001) {
          resolvedSubCode =
            typeof detailsDesc === 'string' ? detailsDesc.match(/\b\d{3}\b/)?.[0] : undefined;
        }

        const reportCode = buildEventReportCode(resolvedCode, resolvedSubCode);
        this.reportEventIfNeeded({
          ...eventReportBaseParams,
          status: 'FAILED',
          detail: {
            code: reportCode,
            desc: '',
          },
          ext: {
            getAttestationResultRes: JSON.stringify(res)
          }
        });
        const algorithmError = new ZkAttestationError(
          resolvedCode as AttestationErrorCode,
          '',
          res,
          resolvedSubCode
        );
        await this._emitProgressIfNeeded(startOptions, {
          type: 'error',
          requestId: currentRequestId,
          error: algorithmError,
        });
        return Promise.reject(algorithmError);
      }
    } catch (e: any) {
      if (e?.code === 'timeout') {
        const timeoutError = new ZkAttestationError('00002', '', e.data);
        await this._emitProgressIfNeeded(startOptions, {
          type: 'error',
          requestId: currentRequestId,
          error: timeoutError,
        });
        this.reportEventIfNeeded({
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
        return Promise.reject(timeoutError)
      } else {
        return Promise.reject(e)
      }
    } finally {
      // Always clear the attestation flag when done
      if (this._concurrency <= 1) {
        this._isAttesting = false;
      }
    }
  }

  private _resolveStartAttestationOptions(
    timeoutOrOptions: number | StartAttestationOptions,
    positionalAlgoUrls?: Pick<AlgorithmUrls, 'primusMpcUrl' | 'primusProxyUrl' | 'proxyUrl'>
  ): Required<Omit<StartAttestationOptions, 'algoUrls' | 'onProgress'>> &
    Pick<StartAttestationOptions, 'algoUrls' | 'onProgress'> {
    if (typeof timeoutOrOptions === 'number') {
      return {
        timeout: timeoutOrOptions,
        algoUrls: positionalAlgoUrls,
        stream: false,
        proveLargeData: false,
        offlineTimeout: 60000,
        pollIntervalMs: 500,
        abortOnProgressError: false,
      };
    }
    return {
      timeout: timeoutOrOptions.timeout ?? 2 * 60 * 1000,
      algoUrls: timeoutOrOptions.algoUrls,
      stream: timeoutOrOptions.stream ?? false,
      proveLargeData: timeoutOrOptions.proveLargeData ?? false,
      offlineTimeout: timeoutOrOptions.offlineTimeout ?? 60000,
      pollIntervalMs: timeoutOrOptions.pollIntervalMs ?? 500,
      onProgress: timeoutOrOptions.onProgress,
      abortOnProgressError: timeoutOrOptions.abortOnProgressError ?? false,
    };
  }

  private _normalizeAlgorithmPoolResult(result: unknown): { phase: 'start' | 'result'; result: any } {
    const maybePhasedResult = result as { phase?: unknown; result?: unknown };
    if (maybePhasedResult?.phase === 'start' || maybePhasedResult?.phase === 'result') {
      return maybePhasedResult as { phase: 'start' | 'result'; result: any };
    }
    return {
      phase: 'result',
      result,
    };
  }

  private async _handleAlgorithmProgress(
    result: unknown,
    requestId: string,
    options: ReturnType<PrimusCoreTLS['_resolveStartAttestationOptions']>
  ): Promise<void> {
    const raw = result as { retcode?: string; requestid?: string; content?: { sequence?: number; data?: unknown } };
    if (raw?.retcode !== '1') {
      return;
    }
    if (raw.content?.data === undefined) {
      return;
    }
    await this._emitProgressIfNeeded(options, {
      type: 'stream-data',
      requestId: raw.requestid || requestId,
      sequence: raw.content?.sequence,
      data: raw.content?.data,
    });
  }

  private async _emitProgressIfNeeded(
    options: ReturnType<PrimusCoreTLS['_resolveStartAttestationOptions']>,
    event: AttestationProgressEvent
  ): Promise<void> {
    if (!options.stream || !options.onProgress) {
      return;
    }
    try {
      await options.onProgress(event);
    } catch (error) {
      if (options.abortOnProgressError) {
        throw error;
      }
    }
  }

  getPrivateData(requestId: string, keyName: string): string | undefined {
    const privateData = this._allPrivateData[requestId];
    if (!privateData || typeof privateData !== 'string') {
      return undefined;
    }
    try {
      const parsed = JSON.parse(privateData);
      return parsed[keyName];
    } catch (err) {
      console.error("Failed to parse privateData:", (err as Error).message);
      return undefined;
    }
  }

  verifyAttestation(attestation: Attestation): boolean {
    const encodeData = encodeAttestation(attestation);
    const signature = attestation.signatures[0];
    const result = ethers.utils.recoverAddress(encodeData, signature);
    const verifyResult = PADO_ADDRESS.toLowerCase() === result.toLowerCase();
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
export type {
  AttMode,
  AttModeInput,
  AttestationProgressEvent,
  GenerateRequestParamsOptions,
  PrimusInitOptions,
  StartAttestationInput,
  StartAttestationOptions,
} from './index.d';
export type { AlgorithmBackend, AlgorithmLogLevel } from './primus_zk';
