import { AttNetworkRequest, AttNetworkResponseResolve, SignedAttRequest } from './index.d'
import { AlgorithmUrls } from './classes/AlgorithmUrls';
export function assemblyParams(att: SignedAttRequest, algorithmUrls: AlgorithmUrls) {
    const { primusMpcUrl, primusProxyUrl, proxyUrl } = algorithmUrls
    let padoUrl = primusProxyUrl;
    let modelType = "proxytls";
    const { attRequest: { request, responseResolves, attMode, userAddress, appId, additionParams}, appSignature } = att
    let host = new URL(request.url).host;
    if (attMode?.algorithmType === "mpctls") {
        padoUrl = primusMpcUrl;
        modelType = "mpctls"
    }
    let timestamp = (+ new Date()).toString();
    const attestationParams = {
        source: "source", // not empty
        requestid: "d9415490-3bc3-49ac-93ca-97165aa2a4a1", // todo:auto generate
        padoUrl, // should set
        proxyUrl, // should set
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
            type:"CONDITION_EXPANSION",
            op: "&",
            subconditions
        }
    }
    return [formatResponse];
}

