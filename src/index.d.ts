export type AttNetworkRequest = {
    url: string,
    method: string,
    header?: object,
    body?: any
}

export type AttNetworkResponseResolve = {
    keyName: string,
    parsePath: string,
    parseType?: string,
    op?: string,
}

export type Attestor = {
    attestorAddr: string,
    url: string
}

export type Attestation = {
    recipient: string,
    request: AttNetworkRequest,
    reponseResolve: AttNetworkResponseResolve[],
    data: string, // json string
    attConditions: string, // json string
    timestamp: number,
    additionParams: string,
    attestors: Attestor[],
    signatures: string[],
}

export type AttModeAlgorithmType = 'mpctls' | 'proxytls'
export type AttModeResultType = 'plain' | 'cipher'
export type AttSslCipher = 'ECDHE-RSA-AES128-GCM-SHA256' | 'ECDHE-ECDSA-AES128-GCM-SHA256'
export type AttMode = {
  algorithmType: AttModeAlgorithmType;
  resultType: AttModeResultType;
}

export type AttRequestOptions = {
    requestid?: string;
    attMode?: AttMode;
    attConditions?: object;
    additionParams?: string;
    extendedParams?: string;
    sslCipher?: AttSslCipher;
    noProxy?: boolean;
    requestInterval?: number;
}

export type BaseAttestationParams = {
    appId: string;
    request: AttNetworkRequest | AttNetworkRequest[];
    responseResolves: AttNetworkResponseResolve[] | AttNetworkResponseResolve[][];
    userAddress: string;
} & AttRequestOptions

export type FullAttestationParams = BaseAttestationParams & {
    timestamp: number;
  }

export type SignedAttRequest = {
    attRequest: FullAttestationParams,
    appSignature: string
}

export type StartAttestationInput = import('./classes/AttRequest').AttRequest | string;

export type GenerateRequestParamsOptions = AttRequestOptions & {
    userAddress?: string;
}

export type PrimusInitOptions = {
    backend?: import('./primus_zk').AlgorithmBackend;
    concurrency?: number;
    logLevel?: import('./primus_zk').AlgorithmLogLevel;
}

export type AttestationProgressEvent =
    | {
        type: 'stream-data';
        requestId: string;
        sequence?: number;
        data: unknown;
    }
    | {
        type: 'proof-ready';
        requestId: string;
    }
    | {
        type: 'error';
        requestId: string;
        error: Error;
    }

export type StartAttestationOptions = {
    timeout?: number;
    algoUrls?: Pick<import('./classes/AlgorithmUrls').AlgorithmUrls, 'primusMpcUrl' | 'primusProxyUrl' | 'proxyUrl'>;
    stream?: boolean;
    proveLargeData?: boolean;
    offlineTimeout?: number;
    pollIntervalMs?: number;
    onProgress?: (event: AttestationProgressEvent) => void | Promise<void>;
    abortOnProgressError?: boolean;
}

export type ApiResponse<T = any> = {
    rc: number;
    mc: string;
    msg: string;
    result: T;
}
