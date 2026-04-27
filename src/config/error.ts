export type AttestationErrorCode =
  '00000' | '00001' | '00002' | '00003' | '00004' | '00005' | '00006' | '00009' | '00010' |
  '00101' | '00102' | '00103' | '00104' |
  '10001' | '10002' | '10003' | '10004' |
  '20001' | '20002' | '20003' | '20004' | '20005' |
  '30001' | '30001:301' | '30001:302' | '30001:401' | '30001:403' | '30001:404' | '30001:429' |
  '30002' | '30003' | '30004' | '30005' | '30006' |
  '40001' | '40002' |
  '50000:501' | '50000:502' | '50003' | '50004' | '50000:505' | '50006' | '50000:507' | '50000:508' | '50009' | '50000:510' | '50011' |
  '99999' |
  '-1200010' |
  '-1002001' | '-1002002' | '-1002003' | '-1002004' | '-1002005'
  ;

/** Maps algorithm errlog codes to NOTE_V2-style `50000:subCode` keys. */
export const ALGO_ERR_NORMALIZE_TO_50000: Record<number, string> = {
  50001: '501',
  50002: '502',
  50005: '505',
  50007: '507',
  50008: '508',
  50010: '510',
};


export const ErrorCodeMAP = {
  '00000': 'Too many requests. Please try again later.',
  '00001': 'Failed to start the algorithm. Please refresh the page, then try again.',
  '00002': 'The verification process timed out. Please try again later.',
  '00003': 'Verification is in progress. Please try again later.',
  '00004': 'Verification was cancelled by the user.',
  '00005': 'Invalid SDK parameters.',
  '00006': 'Extension not detected. Please install and enable Primus Extension from the Chrome Web Store (https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe), then try again.',
  '00104': 'Verification requirements not met.',
  '10001': 'Unstable internet connection. Please try again later.',
  '10002': 'Network connection interrupted during attestation. Please try again later.',
  '10003': 'Connection to the attestation server was interrupted during processing. Please try again later.',
  '10004': 'Connection to the data source server was interrupted during processing. Please try again later.',
  '20001': 'Internal runtime error: LengthException. Contact Primus Team for assistance.',
  '20002': 'Internal runtime error: OutOfRangeException. Contact Primus Team for assistance.',
  '20003': 'Invalid algorithm parameters.',
  '20004': 'Internal runtime error: LogicError. Contact Primus Team for assistance.',
  '20005': 'Runtime error: NotDefined. Contact Primus Team for assistance.',
  '30001': 'Response error. Please try again later.',
  '30001:301': 'Request URL not detected. Contact Primus Team for assistance.',
  '30001:302': 'Response error. Please try again later.',
  '30001:401': 'Session expired. Please log in again.',
  '30001:403': 'Access blocked due to the data source server’s risk control. Please try again later.',
  '30001:404': 'Request URL not detected. Contact Primus Team for assistance.',
  '30001:429': 'Rate limited by the data source server due to excessive requests from this user. Please try again later.',
  '30002': 'Response validation error. Please try again later.',
  '30003': 'Response parsing error. Please try again later.',
  '30004': 'JSON parsing error. Contact Primus Team for assistance.',
  '30005': 'HTML parsing error. Contact Primus Team for assistance.',
  '30006': 'Preset path key not found in the response. Contact Primus Team for assistance.',
  '40001': 'Internal error: FileNotExistException. Contact Primus Team for assistance.',
  '40002': 'SSL certificate error. Contact Primus Team for assistance.',
  '50000:501': 'Internal algorithm error. Contact Primus Team for assistance.',
  '50000:502': 'Internal algorithm error. Contact Primus Team for assistance.',
  '50003': 'The client encountered an unexpected error. Please try again later.',
  '50004': 'The client did not start correctly. Please try again later.',
  '50000:505': 'Internal algorithm error. Contact Primus Team for assistance.',
  '50006': 'Algorithm server not started. Please try again later.',
  '50000:507': 'Internal algorithm error. Contact Primus Team for assistance.',
  '50000:508': 'Internal algorithm error. Contact Primus Team for assistance.',
  '50009': 'Algorithm service timed out. Please try again later.',
  '50000:510': 'Internal algorithm error. Contact Primus Team for assistance.',
  '50011': 'Unsupported TLS version. Contact Primus Team for assistance.',
  '99999': 'Undefined error. Please try again later.',
  '-1002001': 'Invalid app ID.',
  '-1002002': 'Invalid app secret.',
  '-1002003': 'Trial quota exhausted.',
  '-1002004': 'Subscription expired.',
  '-1002005': 'Quota exhausted.',
};

