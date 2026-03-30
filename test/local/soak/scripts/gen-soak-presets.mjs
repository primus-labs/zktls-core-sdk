/**
 * Regenerates soak-presets.ts: test/local/listdao, soak/listdao, soak/listadao, then soak/<source>/.
 * Run: node test/local/soak/scripts/gen-soak-presets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOAK_DIR = path.resolve(__dirname, '..');
/** test/local/listdao (optional), then test/local/soak/listdao or soak/listadao */
const LOCAL_LISTDAO = path.resolve(SOAK_DIR, '..', 'listdao');
const LISTDAO = path.join(SOAK_DIR, 'listdao');
const LISTADAO = path.join(SOAK_DIR, 'listadao');
const OUT = path.join(SOAK_DIR, 'soak-presets.ts');

/** Local listdao first, then soak/listdao, soak/listadao, then soak/<source>/ */
function resolveParamsJson(sourceDir) {
  const candidates = [
    path.join(LOCAL_LISTDAO, sourceDir, 'params.json'),
    path.join(LOCAL_LISTDAO, sourceDir, 'param.json'),
    path.join(LISTDAO, sourceDir, 'params.json'),
    path.join(LISTDAO, sourceDir, 'param.json'),
    path.join(LISTADAO, sourceDir, 'params.json'),
    path.join(LISTADAO, sourceDir, 'param.json'),
    path.join(SOAK_DIR, sourceDir, 'params.json'),
    path.join(SOAK_DIR, sourceDir, 'param.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(
    `[gen-soak-presets] Missing params for "${sourceDir}". Tried:\n  ${candidates.join('\n  ')}`
  );
}

function collectReveals(cond, out) {
  if (!cond || typeof cond !== 'object') return;
  if (cond.type === 'FIELD_REVEAL' && cond.reveal_id && cond.field && typeof cond.field.field === 'string') {
    const parsePath = cond.field.field;
    const parseType = parsePath.startsWith('$') ? 'json' : 'html';
    out.push({ keyName: String(cond.reveal_id), parseType, parsePath });
  }
  if (Array.isArray(cond.subconditions)) {
    for (const s of cond.subconditions) collectReveals(s, out);
  }
}

function escapeStr(s) {
  return JSON.stringify(s);
}

function headerToTs(h) {
  if (!h || typeof h !== 'object') return '{}';
  const keys = Object.keys(h);
  const lines = keys.map((k) => `        ${escapeStr(k)}: ${escapeStr(String(h[k]))},`);
  return `{\n${lines.join('\n')}\n      }`;
}

function paramsToPreset(j, presetVar) {
  const source = j.source || 'unknown';
  const name = `listdao_${source}`;
  const requests = (j.requests || []).map((r) => {
    const header = r.headers || r.header || {};
    let body = '';
    if (r.body !== undefined && r.body !== null) {
      body = typeof r.body === 'object' ? JSON.stringify(r.body) : String(r.body);
    }
    return { url: r.url, method: r.method || 'GET', header, body };
  });
  const responseResolves = (j.responses || []).map((resp) => {
    const reveals = [];
    collectReveals(resp.conditions, reveals);
    return reveals;
  });
  const attMode =
    j.modelType === 'mpctls'
      ? { algorithmType: 'mpctls', resultType: 'plain' }
      : { algorithmType: 'proxytls', resultType: 'plain' };
  let noProxy;
  let attConditions;
  try {
    const ap = JSON.parse(j.appParameters?.appSignParameters || '{}');
    if (ap.noProxy === true) noProxy = true;
    if (ap.attConditions != null && typeof ap.attConditions === 'object') {
      attConditions = ap.attConditions;
    }
  } catch {
    /* ignore */
  }
  const additionParams =
    typeof j.appParameters?.additionParams === 'string' && j.appParameters.additionParams !== ''
      ? j.appParameters.additionParams
      : undefined;

  let ts = `const ${presetVar}: SoakPreset = {\n  name: ${escapeStr(name)},\n  requests: [\n`;
  for (const req of requests) {
    ts += `    {\n      url: ${escapeStr(req.url)},\n      method: ${escapeStr(req.method)},\n      header: ${headerToTs(req.header)},\n      body: ${escapeStr(req.body)},\n    },\n`;
  }
  ts += `  ],\n  responseResolves: [\n`;
  for (const group of responseResolves) {
    ts += `    [\n`;
    for (const x of group) {
      ts += `      {\n        keyName: ${escapeStr(x.keyName)},\n        parseType: ${escapeStr(x.parseType)},\n        parsePath: ${escapeStr(x.parsePath)},\n      },\n`;
    }
    ts += `    ],\n`;
  }
  ts += `  ],\n  attMode: { algorithmType: ${escapeStr(attMode.algorithmType)}, resultType: ${escapeStr(attMode.resultType)} }`;
  if (noProxy) ts += `,\n  noProxy: true`;
  if (additionParams !== undefined) ts += `,\n  additionParams: ${escapeStr(additionParams)}`;
  if (attConditions !== undefined) ts += `,\n  attConditions: ${JSON.stringify(attConditions)}`;
  ts += `,\n};`;
  return ts;
}

const header =
  '/**\n' +
  ' * Params: test/local/listdao → soak/listdao → soak/listadao/<source>/ (params.json or param.json).\n' +
  ' * presetGithub, presetSteam, presetBinance, presetAmazon, presetOkx.\n' +
  ' * Regenerate: node test/local/soak/scripts/gen-soak-presets.mjs\n' +
  ' */\n' +
  "import type { AttMode, AttNetworkRequest, AttNetworkResponseResolve } from '../../../src/index.d';\n\n" +
  'export type SoakPreset = {\n' +
  '  name: string;\n' +
  '  requests: AttNetworkRequest[];\n' +
  '  responseResolves: AttNetworkResponseResolve[][];\n' +
  '  attMode: AttMode;\n' +
  '  noProxy?: boolean;\n' +
  '  /** From listdao appParameters.additionParams */\n' +
  '  additionParams?: string;\n' +
  '  /** From listdao appSignParameters attConditions */\n' +
  '  attConditions?: object;\n' +
  '};\n\n';

/** [listdao folder, exported const name] */
const MAP = [
  ['github', 'presetGithub'],
  ['steam', 'presetSteam'],
  ['binance', 'presetBinance'],
  ['amazon', 'presetAmazon'],
  ['okx', 'presetOkx'],
];

let out = header;
for (const [dir, pv] of MAP) {
  const paramsPath = resolveParamsJson(dir);
  const j = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
  out += paramsToPreset(j, pv) + '\n\n';
}
out +=
  "export const SOAK_PRESET_SOURCES = ['github', 'steam', 'binance', 'amazon', 'okx'] as const;\n" +
  'export type SoakPresetSource = (typeof SOAK_PRESET_SOURCES)[number];\n\n' +
  '/** Pick one preset for `npm run soak:<source>` (see `soak-proofs.ts` argv). */\n' +
  'export const SOAK_PRESET_BY_SOURCE: Record<SoakPresetSource, SoakPreset> = {\n' +
  '  github: presetGithub,\n' +
  '  steam: presetSteam,\n' +
  '  binance: presetBinance,\n' +
  '  amazon: presetAmazon,\n' +
  '  okx: presetOkx,\n' +
  '};\n\n' +
  '/** Default `npm run soak`: all sources in order. */\n' +
  'export const SOAK_PRESETS: readonly SoakPreset[] = [\n' +
  '  presetGithub,\n' +
  '  presetSteam,\n' +
  '  presetBinance,\n' +
  '  presetAmazon,\n' +
  '  presetOkx,\n' +
  '];\n';

fs.writeFileSync(OUT, out, 'utf8');
process.stderr.write(`Wrote ${OUT} (${out.length} bytes)\n`);
