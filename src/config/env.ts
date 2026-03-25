// const pEnv = 'production'
const pEnv = 'test'
const pEnvMap = {
  production: {
    PRIMUS_PROXY_URL: 'wss://api2.padolabs.org/algorithm-proxy',
    PRIMUS_MPC_URL: 'wss://api2.padolabs.org/algorithm',
    PROXY_URL: 'wss://api2.padolabs.org/algoproxy',
    BASE_SERVICE_URL: 'https://api.padolabs.org',
    PADOADDRESS: '0xDB736B13E2f522dBE18B2015d0291E4b193D8eF6',
  },
  test: {
    PRIMUS_PROXY_URL: 'wss://api-dev.padolabs.org/algorithm-proxy',
    PRIMUS_MPC_URL: 'wss://api-dev.padolabs.org/algorithm',
    PROXY_URL: 'wss://api-dev.padolabs.org/algoproxy',
    BASE_SERVICE_URL: 'https://api-dev.padolabs.org',
    PADOADDRESS: '0xe02bd7a6c8aa401189aebb5bad755c2610940a73',
  },
}


const BASEAPIMap = {
  production: 'https://api.padolabs.org',
  test: 'https://api-dev.padolabs.org'
}



export const PRIMUS_PROXY_URL = pEnvMap[pEnv].PRIMUS_PROXY_URL
export const PRIMUS_MPC_URL = pEnvMap[pEnv].PRIMUS_MPC_URL
export const PROXY_URL = pEnvMap[pEnv].PROXY_URL
export const BASE_SERVICE_URL = pEnvMap[pEnv].BASE_SERVICE_URL
export const PADOADDRESS = pEnvMap[pEnv].PADOADDRESS
export const BASEAPI = BASEAPIMap[pEnv]
