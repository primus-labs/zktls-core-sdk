import { AttConditionExpansion, AttConditionItem, AttConditions, AttNetworkRequest, AttNetworkResponseResolve, SignedAttRequest, StartAttestationOptions } from './index.d';
import { AlgorithmUrls } from './classes/AlgorithmUrls';
import { normalizeRequestId } from './utils/requestId';
type AssemblyOptions = Pick<Required<StartAttestationOptions>, 'proveLargeData' | 'offlineTimeout'>;

export function assemblyParams(att: SignedAttRequest, algorithmUrls: AlgorithmUrls, options: AssemblyOptions) {
    let { primusMpcUrl, primusProxyUrl, proxyUrl } = algorithmUrls
    let padoUrl = primusProxyUrl;
    let modelType = "proxytls";
    const { attRequest: { request, responseResolves, attMode, userAddress, appId, additionParams, sslCipher, noProxy, requestInterval, attConditions, requestid: inputRequestId }, appSignature } = att
    const requestUrl = Array.isArray(request) ? request[0].url : request.url;
    let host = new URL(requestUrl).host;
    const requestid = normalizeRequestId(inputRequestId);
    if (attMode?.algorithmType === "mpctls") {
        padoUrl = primusMpcUrl;
        modelType = "mpctls"
        if (noProxy) {
            proxyUrl = ""; // only supported under mpctls model
        }
    }
    // console.log('assemblyParams', padoUrl, proxyUrl, modelType);
    let timestamp = (+ new Date()).toString();
    const attestationParams = {
        source: "source", // not empty
        requestid,
        padoUrl,
        proxyUrl,
        getdatatime: timestamp,
        credVersion: "1.0.5",
        modelType, // one of [mpctls, proxytls]
        user: {
            userid: "0",
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
        responses: assemblyResponse(responseResolves, attConditions),
        templateId: "",
        padoExtensionVersion: "0.3.21",
        cipher: sslCipher,
        requestIntervalMs: String(requestInterval),
        proveLargeData: String(options.proveLargeData),
        offlineTimeout: String(options.offlineTimeout),
    };
    // console.log('attestationParams====', JSON.stringify(attestationParams));
    return attestationParams;
}

function assemblyRequest(request: AttNetworkRequest | AttNetworkRequest[]) {
    const requests = Array.isArray(request) ? request : [request]
    return requests.map(({ url, header, method, body }, idx) => ({
        url,
        method,
        headers: {
            ...header,
            'Accept-Encoding': 'identity',
        },
        body,
        name: `${url}-${idx}`
    }))
}

function _getField(parsePath: string, op?: string) {
    if (op === "SHA256_EX") {
        return { "type": "FIELD_ARITHMETIC", "op": "SHA256", "field": parsePath };
    } else if (op === "SHA256_WITH_SALT") {
        return { "type": "FIELD_ARITHMETIC", "op": "SHA256_WITH_SALT", "field": parsePath };
    }
    return parsePath;
}
function _getOp(op?: string) {
    if (op === "SHA256_EX") {
        return "REVEAL_HEX_STRING";
    } else if (op === "SHA256_WITH_SALT") {
        return "REVEAL_SALTTED_HASH";
    }
    return op ? op: 'REVEAL_STRING';
}
function _getType(op?: string) {
    if (['>', '>=', '=', '!=', '<', '<=', 'STREQ', 'STRNEQ', 'STRCASEEQ', 'STRCASENEQ'].includes(op ?? '')) {
        return 'FIELD_RANGE';
    } else if (op === 'SHA256') {
        return "FIELD_VALUE"
    }
    return "FIELD_REVEAL"
}

function isMatchOneCondition(condition: AttConditionItem): condition is AttConditionExpansion {
    return condition.op === 'MATCH_ONE';
}

function assemblyResponse(responseResolves: AttNetworkResponseResolve[] | AttNetworkResponseResolve[][], attConditions: AttConditions = []) {
    const groups = Array.isArray(responseResolves[0])
        ? responseResolves as AttNetworkResponseResolve[][]
        : [responseResolves as AttNetworkResponseResolve[]];
    return groups.map((group, idx) => {
        const urlItemConditions: AttConditionItem[] | undefined = attConditions[idx];
        const subconditions = group.map(rR => {
            let itemOp = '';
            let itemValue = '';
            const { keyName, parsePath } = rR;
            if (urlItemConditions && Array.isArray(urlItemConditions)) {
                // Find matching condition by field name
                const matchingCondition = urlItemConditions.find((cond) => {
                    if (isMatchOneCondition(cond)) {
                        return cond.key === keyName;
                    }
                    return cond.field === keyName;
                });
                if (matchingCondition) {
                    if (isMatchOneCondition(matchingCondition)) {
                        return {
                            type: matchingCondition.type,
                            op: matchingCondition.op,
                            field: matchingCondition.field,
                            subconditions: matchingCondition.value,
                        };
                    }
                    itemOp = matchingCondition.op;
                    itemValue = matchingCondition.value ?? '';
                }
            }
            return {
                field: _getField(parsePath, itemOp),
                reveal_id: keyName,
                op: _getOp(itemOp),
                type: _getType(itemOp),
                value: itemValue,
            };
        });

        return {
            conditions: {
                type: "CONDITION_EXPANSION",
                op: "BOOLEAN_AND",
                // op:  Array.isArray(responseResolves[0])?"BOOLEAN_AND": "&",
                subconditions,
            },
        };
    });
}

