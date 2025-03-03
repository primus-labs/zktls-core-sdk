export type AttNetworkRequest = {
    url: string,
    method: string,
    header?: object,
    body?: any
}

export type AttNetworkResponseResolve = {
    keyName: string,
    parsePath: string,
    parseType?: string
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

export type BaseAttestationParams = {
    appId: string;
    request: AttNetworkRequest;
    responseResolves: AttNetworkResponseResolve[];
    userAddress: string;
}

export type FullAttestationParams = BaseAttestationParams & {
    timestamp: number;
    attMode?: AttMode;
    attConditions?: object;
    additionParams?: string;
    sslCipher?: AttSslCipher;
  }

export type SignedAttRequest = {
    attRequest: FullAttestationParams,
    appSignature: string
}