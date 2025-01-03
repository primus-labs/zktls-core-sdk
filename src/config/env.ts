import * as dotenv from 'dotenv';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.test';
dotenv.config({ path: envFile });

export const NODE_ENV = process.env.NODE_ENV;
export const PRIMUS_PROXY_URL = process.env.PRIMUS_PROXY_URL || ''
export const PRIMUS_MPC_URL = process.env.PRIMUS_MPC_URL || ''
export const PROXY_URL = process.env.PROXY_URL || ''
export const BASE_SERVICE_URL = process.env.BASE_SERVICE_URL || ''

