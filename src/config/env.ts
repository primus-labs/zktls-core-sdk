const pEnv = 'test'
const pEnvMap = {
  production: {
    PRIMUS_PROXY_URL: 'wss://api2.padolabs.org/algorithm-proxy',
    PRIMUS_MPC_URL: 'wss://api2.padolabs.org/algorithm',
    PRIMUS_TEE_URL: 'wss://api2.padolabs.org/algorithm/teetls',
    PROXY_URL: 'wss://api2.padolabs.org/algoproxy',
    BASE_SERVICE_URL: 'https://api.padolabs.org',
    PADO_ADDRESS: '0x5Ed3176045F68617B0958a61ac1868875C98C14d',
  },
  test: {
    PRIMUS_PROXY_URL: 'wss://api-dev.padolabs.org/algorithm-proxy',
    PRIMUS_MPC_URL: 'wss://api-dev.padolabs.org/algorithm',
    PRIMUS_TEE_URL: 'wss://api-dev.padolabs.org/algorithm/teetls',
    PROXY_URL: 'wss://api-dev.padolabs.org/algoproxy',
    BASE_SERVICE_URL: 'https://api-dev.padolabs.org',
    PADO_ADDRESS: '0xe02bd7a6c8aa401189aebb5bad755c2610940a73',
  }
}


const BASEAPIMap = {
  production: 'https://api.padolabs.org',
  test: 'https://api-dev.padolabs.org'
}

export const PRIMUS_PROXY_URL = pEnvMap[pEnv].PRIMUS_PROXY_URL
export const PRIMUS_MPC_URL = pEnvMap[pEnv].PRIMUS_MPC_URL
export const PRIMUS_TEE_URL = pEnvMap[pEnv].PRIMUS_TEE_URL
export const PROXY_URL = pEnvMap[pEnv].PROXY_URL
export const BASE_SERVICE_URL = pEnvMap[pEnv].BASE_SERVICE_URL
export const PADO_ADDRESS = pEnvMap[pEnv].PADO_ADDRESS
export const BASEAPI = BASEAPIMap[pEnv]
