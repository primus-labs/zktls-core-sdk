import { AttNetworkRequest, AttNetworkResponseResolve, SignedAttRequest } from './index.d'

export function assemblyParams(att: SignedAttRequest) {
    let padoUrl, proxyUrl, modelType = "proxytls";
    const ENV = process.env;
    const NODE_ENV = ENV.NODE_ENV;
    console.log('--------------process.env.NODE_ENV', NODE_ENV)
    padoUrl =  'wss://api-dev.padolabs.org/algorithm-proxyV2';
    proxyUrl = 'wss://api-dev.padolabs.org/algoproxyV2';
    const { attRequest: { request, responseResolves, attMode, userAddress, appId, additionParams}, appSignature } = att
    let host = new URL(request.url).host;
    if (attMode?.algorithmType === "mpctls") {
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
            userid: "",
            address: userAddress,
            token: "",
        },
        authUseridHash: "",
        appParameters: {
            appId: appId,
            appSignParameters: JSON.stringify(att.attRequest),
            appSignature: appSignature,
            additionParams: additionParams || ''
        },
        reqType: "web",
        host,
        requests: assemblyRequest(request),
        responses: assemblyResponse(responseResolves),
        templateId: "5555555555555555555",
        PADOSERVERURL: "https://api-dev.padolabs.org",
        padoExtensionVersion: "0.3.21"
    };
    return attestationParams;
}

function assemblyRequest(request: AttNetworkRequest) {
    let { url, header, method, body } = request;
    const formatRequest = {
            url,
            method,
            headers: {...header,'Accept-Encoding': 'identity'},
            body,
        }
    return [formatRequest]
}

function assemblyResponse(responseResolves: AttNetworkResponseResolve[]) {
    const subconditions = responseResolves.map(rR => {
        const {keyName, parsePath} = rR
        return {
            field: parsePath,
            reveal_id: keyName,
            op: "REVEAL_STRING",
            type: "FIELD_REVEAL"
        }
    })
    const formatResponse = {
        conditions: {
            subconditions
        },
        op: "&",
        type:"CONDITION_EXPANSION"
    }
    return [formatResponse];
}