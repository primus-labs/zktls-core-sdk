/**
 * Regenerates test/local/soak/soak-presets.ts from test/local/soak/listdao/<source>/params.json
 * Run: node test/local/soak/scripts/gen-soak-presets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOAK_DIR = path.resolve(__dirname, '..');
const LISTDAO = path.join(SOAK_DIR, 'listdao');
const OUT = path.join(SOAK_DIR, 'soak-presets.ts');

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
  try {
    const ap = JSON.parse(j.appParameters?.appSignParameters || '{}');
    if (ap.noProxy === true) noProxy = true;
  } catch {
    /* ignore */
  }

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
  ts += `,\n};`;
  return ts;
}

const header =
  '/**\n' +
  ' * Soak presets from test/local/soak/listdao/<source>/params.json\n' +
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
  const j = JSON.parse(fs.readFileSync(path.join(LISTDAO, dir, 'params.json'), 'utf8'));
  out += paramsToPreset(j, pv) + '\n\n';
}
out +=
  'export const SOAK_PRESETS: readonly SoakPreset[] = [\n' +
  '  presetGithub,\n' +
  '  presetSteam,\n' +
  '  presetBinance,\n' +
  '  presetAmazon,\n' +
  '  presetOkx,\n' +
  '];\n';

fs.writeFileSync(OUT, out, 'utf8');
process.stderr.write(`Wrote ${OUT} (${out.length} bytes)\n`);
