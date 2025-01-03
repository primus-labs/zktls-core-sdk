import { AttNetworkRequest, AttNetworkResponseResolve, SignedAttRequest } from './index.d'

export function assemblyParams(att: SignedAttRequest) {
    let padoUrl, proxyUrl, modelType="proxytls";
    padoUrl = "wss://api-dev.padolabs.org/algorithm-proxyV2";
    proxyUrl = "wss://api-dev.padolabs.org/algoproxyV2";
    let host = att.attRequest.request.url;
    if (att.attRequest.attMode?.algorithmType === "mpctls") {
        padoUrl = "wss://api-dev.padolabs.org/algorithmV2";
        modelType = "mpctls"
    }
    let timestamp = (+ new Date()).toString();
    const attestationParams = {
        source: "source", // not empty
        requestid: "d9415490-3bc3-49ac-93ca-97165aa2a4a1", // todo:auto generate
        padoUrl: padoUrl, // should set
        proxyUrl: proxyUrl, // should set
        getdatatime: timestamp, // todo:auto generate
        credVersion: "1.0.5",
        modelType: modelType, // one of [mpctls, proxytls]
        user: {
            userid: "0",
            address: att.attRequest.userAddress,
            token: "0",
        },
        authUseridHash: "",
        appParameters: {
            appId: att.attRequest.appId,
            appSignParameters: att.attRequest.toJsonString(),
            appSignature: att.appSignature,
            additionParams: att.attRequest.additionParams
        },
        reqType: "web",
        host: host, // should set
        requests: assemblyRequest(att.attRequest.request),
        responses: assemblyResponse(att.attRequest.reponseResolve), // should set
        templateId: "",
        PADOSERVERURL: "https://api-dev.padolabs.org",
        padoExtensionVersion: "0.3.21"
    };
    return attestationParams;
}

function assemblyRequest(request: AttNetworkRequest) {
    return [];
}

function assemblyResponse(reponseResolve: AttNetworkResponseResolve[]) {
    return [];
}