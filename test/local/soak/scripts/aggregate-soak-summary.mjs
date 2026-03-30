/**
 * Sum totalProofs / totalSuccess / totalFail and merge failByCode from soak **progress** snapshots.
 * Only files named `soak-progress-*.json` under the directory are included (excludes this script’s output).
 *
 * Usage: node test/local/soak/scripts/aggregate-soak-summary.mjs [summaryDir] [outFile]
 * Defaults: test/local/soak/summary and soak-progress-aggregated.json inside it.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const defaultSummaryDir = path.join(repoRoot, 'test/local/soak/summary');

const summaryDir = path.resolve(process.argv[2] || defaultSummaryDir);
const outFile = path.resolve(process.argv[3] || path.join(summaryDir, 'soak-progress-aggregated.json'));
const outBasename = path.basename(outFile);

function isProgressShape(j) {
  return (
    j &&
    typeof j === 'object' &&
    typeof j.totalProofs === 'number' &&
    typeof j.totalSuccess === 'number' &&
    typeof j.totalFail === 'number' &&
    typeof j.failByCode === 'object'
  );
}

/** Only soak run snapshots: soak-progress-<source>-<stamp>.json — not merged output or other JSON. */
function isSoakProgressSnapshotFilename(f) {
  if (!f.startsWith('soak-progress-') || !f.endsWith('.json')) {
    return false;
  }
  if (f === outBasename) {
    return false;
  }
  if (f.startsWith('soak-progress-aggregated')) {
    return false;
  }
  return true;
}

const files = fs.readdirSync(summaryDir).filter(isSoakProgressSnapshotFilename);
let totalProofs = 0;
let totalSuccess = 0;
let totalFail = 0;
const failByCode = {};
const usedFiles = [];

for (const f of files.sort()) {
  const fp = path.join(summaryDir, f);
  let j;
  try {
    j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    continue;
  }
  if (!isProgressShape(j)) {
    continue;
  }
  usedFiles.push(f);
  totalProofs += j.totalProofs | 0;
  totalSuccess += j.totalSuccess | 0;
  totalFail += j.totalFail | 0;
  for (const [code, v] of Object.entries(j.failByCode || {})) {
    if (!failByCode[code]) {
      failByCode[code] = { total: 0, details: {} };
    }
    failByCode[code].total += (v && v.total) | 0;
    for (const [preset, n] of Object.entries((v && v.details) || {})) {
      failByCode[code].details[preset] = (failByCode[code].details[preset] || 0) + (n | 0);
    }
  }
}

const codes = Object.keys(failByCode).sort();
const orderedFail = {};
for (const c of codes) {
  orderedFail[c] = failByCode[c];
}

const out = {
  totalProofs,
  totalSuccess,
  totalFail,
  failByCode: orderedFail,
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
process.stderr.write(
  `Wrote ${outFile} from ${usedFiles.length} file(s): ${usedFiles.sort().join(', ')}\n`
);
