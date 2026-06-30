export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS'
  | 'CONNECT'
  | 'TRACE';

export type AttNetworkRequest = {
    url: string,
    method: HttpMethod | (string & Record<never, never>),
    header?: Record<string, string>,
    body?: string | Record<string, unknown>,
}

export type AttNetworkResponseResolve = {
    keyName: string,
    parsePath: string,
    parseType?: string,
    op?: string,
}

export type AttConditionOp =
  | 'SHA256_EX'
  | 'SHA256_WITH_SALT'
  | 'SHA256'
  | 'REVEAL_STRING'
  | 'STREQ'
  | 'STRNEQ'
  | 'STRCASEEQ'
  | 'STRCASENEQ'
  | 'MATCH_ONE'
  | '>'
  | '>='
  | '='
  | '!='
  | '<'
  | '<=';

export type AttConditionType =
  | 'FIELD_RANGE'
  | 'FIELD_REVEAL'
  | 'FIELD_VALUE'
  | 'FIELD_ARITHMETIC'
  | 'CONDITION_EXPANSION';

export type AttFieldCondition = {
    type?: Exclude<AttConditionType, 'CONDITION_EXPANSION'>;
    field: string;
    op: AttConditionOp | (string & Record<never, never>);
    value?: string;
};

export type AttConditionExpansion = {
    type: 'CONDITION_EXPANSION';
    op: 'MATCH_ONE';
    key: string;
    field: string;
    value: AttFieldCondition[];
};

export type AttConditionItem = AttFieldCondition | AttConditionExpansion;

/** One condition group per network request in batch mode. */
export type AttConditions = AttConditionItem[][];

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

export type AttModeInput = {
  algorithmType: AttModeAlgorithmType;
  resultType?: AttModeResultType;
}

export type AttRequestOptions = {
    requestid?: string;
    attMode?: AttModeInput;
    attConditions?: AttConditions;
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
    logLength?: number;
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

/** Parsed `encodedData` payload returned by {@link PrimusCoreTLS.startAttestation}. */
export type StartAttestationResult = Attestation & Record<string, unknown>;

export type ApiResponse<T = unknown> = {
    rc: number;
    mc: string;
    msg: string;
    result: T;
}
