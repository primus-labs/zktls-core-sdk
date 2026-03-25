/**
 * Soak runner: cycles through SOAK_PRESETS in order, round after round.
 * See test/local/soak/README-soak.md for environment variables.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';
import * as dotenv from 'dotenv';
import { PrimusCoreTLS } from '../../../src/index';
import { SOAK_PRESETS, type SoakPreset } from './soak-presets';
import type { AttNetworkRequest, Attestation } from '../../../src/index.d';

dotenv.config();

const LAST_RESULTS_CAP = 200;

/** Default rounds: 1 (presets 0–4 once). Set SOAK_MAX_ROUNDS=0 for infinite. */
const DEFAULT_MAX_ROUNDS = 10000;

/** Progress JSON under `test/local/soak/summary/` by default (paths relative to repo root / `cwd`). */
const DEFAULT_PROGRESS_PATH = 'test/local/soak/summary/soak-progress.json';

type ResultRow = {
  t: string;
  round: number;
  presetIndex: number;
  presetName: string;
  status: 'success' | 'failed';
  /** Wall time from start of this proof (before runOneProof) until completion, ms */
  durationMs: number;
  code?: string;
  message?: string;
};

type AttestationRecord = {
  t: string;
  round: number;
  presetIndex: number;
  presetName: string;
  /** false when startAttestation returned but verifyAttestation failed */
  verified: boolean;
  attestation: unknown;
};

type FailByCodeEntry = {
  total: number;
  details: Record<string, number>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function proofElapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function bumpFailByCode(bucket: Record<string, FailByCodeEntry>, code: string, presetName: string): void {
  let entry = bucket[code];
  if (!entry) {
    entry = { total: 0, details: {} };
    bucket[code] = entry;
  }
  entry.total += 1;
  entry.details[presetName] = (entry.details[presetName] ?? 0) + 1;
}

function snapshotFailByCode(bucket: Record<string, FailByCodeEntry>): Record<string, FailByCodeEntry> {
  const out: Record<string, FailByCodeEntry> = {};
  for (const [code, entry] of Object.entries(bucket)) {
    out[code] = { total: entry.total, details: { ...entry.details } };
  }
  return out;
}

function parseEnvInt(name: string, defaultVal: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') {
    return defaultVal;
  }
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : defaultVal;
}

/** Comma-separated tokens from env (trimmed, empty omitted). Used for `SOAK_HALT_ON_ERROR_CODES`. */
function parseEnvCsvSet(name: string): Set<string> {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') {
    return new Set();
  }
  const out = new Set<string>();
  for (const part of v.split(',')) {
    const s = part.trim();
    if (s) {
      out.add(s);
    }
  }
  return out;
}

function toJsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return value;
  }
}

function parsePresetHeadersJson(presetOneBased: number): Record<string, string> | undefined {
  const key = `SOAK_PRESET_${presetOneBased}_HEADERS_JSON`;
  const raw = process.env[key];
  if (!raw || !raw.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`[soak] ${key} must be a JSON object, ignoring`);
      return undefined;
    }
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(parsed as Record<string, unknown>)) {
      out[k] = val === undefined || val === null ? '' : String(val);
    }
    return out;
  } catch (e) {
    console.warn(`[soak] Failed to parse ${key}:`, e);
    return undefined;
  }
}

function mergePresetRequests(preset: SoakPreset, presetOneBased: number): AttNetworkRequest[] {
  const extra = parsePresetHeadersJson(presetOneBased);
  return preset.requests.map((r) => ({
    ...r,
    header: { ...(typeof r.header === 'object' && r.header !== null ? r.header : {}), ...(extra ?? {}) },
  }));
}

function parseErr(e: unknown): { code: string; message: string } {
  if (e !== null && typeof e === 'object' && 'code' in e) {
    const o = e as { code?: unknown; message?: unknown };
    return {
      code: String(o.code ?? 'unknown'),
      message: typeof o.message === 'string' ? o.message : String(e),
    };
  }
  if (e instanceof Error) {
    return { code: 'Error', message: e.message };
  }
  return { code: 'unknown', message: String(e) };
}

async function runOneProof(
  zk: PrimusCoreTLS,
  preset: SoakPreset,
  mergedRequests: AttNetworkRequest[],
  timeoutMs: number
): Promise<
  | { ok: true; attestation: unknown }
  | { ok: false; code: string; message: string; attestation?: unknown }
> {
  const attReq =
    mergedRequests.length === 1
      ? zk.generateRequestParams(mergedRequests[0], preset.responseResolves[0])
      : zk.generateRequestParams(mergedRequests, preset.responseResolves);

  attReq.setAttMode(preset.attMode);
  if (preset.noProxy !== undefined) {
    attReq.setNoProxy(preset.noProxy);
  }

  const attestation = (await zk.startAttestation(attReq, timeoutMs)) as Attestation;
  const attJson = toJsonSafe(attestation);
  const verified = zk.verifyAttestation(attestation);
  if (!verified) {
    return { ok: false, code: 'VERIFY_FAILED', message: 'verifyAttestation returned false', attestation: attJson };
  }
  return { ok: true, attestation: attJson };
}

function writeJsonFile(filePath: string, data: unknown): void {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/** `Asia/Shanghai` wall time, filesystem-safe: `2026-03-21T10-24-31-289` (no `:` / `.`). */
function formatChinaWallTimeForFilename(d: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    fractionalSecondDigits: 3,
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = p.value;
    }
  }
  const y = map.year ?? '0000';
  const mo = map.month ?? '01';
  const da = map.day ?? '01';
  const h = map.hour ?? '00';
  const mi = map.minute ?? '00';
  const se = map.second ?? '00';
  const frac = map.fractionalSecond ?? String(d.getTime() % 1000).padStart(3, '0');
  return `${y}-${mo}-${da}T${h}-${mi}-${se}-${frac}`;
}

/** Inserts one precomputed run stamp (China wall time string) before the extension — same string for summary + progress paths. */
function pathWithRunStamp(basePath: string, runStampFs: string): string {
  const ext = path.extname(basePath);
  const stem = ext.length > 0 ? basePath.slice(0, -ext.length) : basePath;
  return `${stem}-${runStampFs}${ext}`;
}

async function main(): Promise<void> {
  /** First moment of this run: one stamp for both output paths and for `runStamp` / `runStartedAt` inside every JSON write. */
  const soakRunStarted = new Date();
  const runStampFs = formatChinaWallTimeForFilename(soakRunStarted);
  const runStartedAtIso = soakRunStarted.toISOString();

  const appId = process.env.ZKTLS_APP_ID;
  const appSecret = process.env.ZKTLS_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('ZKTLS_APP_ID and ZKTLS_APP_SECRET must be set (e.g. in .env)');
  }

  const maxRounds = parseEnvInt('SOAK_MAX_ROUNDS', DEFAULT_MAX_ROUNDS);
  const timeoutMs = parseEnvInt('SOAK_ATTEST_TIMEOUT_MS', 1 * 60 * 1000);
  const intervalMs = parseEnvInt('SOAK_REQUEST_INTERVAL_MS', 5 * 1000);
  const haltOnErrorCodes = parseEnvCsvSet('SOAK_HALT_ON_ERROR_CODES');
  const logPath = process.env.SOAK_LOG_PATH?.trim();
  const summaryPathEnv = process.env.SOAK_SUMMARY_PATH?.trim();
  const progressPathEnv = process.env.SOAK_PROGRESS_PATH?.trim();

  let summaryPath: string | null;
  if (summaryPathEnv === '') {
    summaryPath = null;
  } else if (summaryPathEnv) {
    summaryPath = pathWithRunStamp(summaryPathEnv, runStampFs);
  } else {
    summaryPath = null;
  }

  let progressPath: string | null;
  if (progressPathEnv === '') {
    progressPath = null;
  } else if (progressPathEnv) {
    progressPath = pathWithRunStamp(progressPathEnv, runStampFs);
  } else {
    progressPath = pathWithRunStamp(DEFAULT_PROGRESS_PATH, runStampFs);
  }

  let stopRequested = false;
  let haltForErrorCode = false;
  const onStop = (): void => {
    stopRequested = true;
    console.log('\n[soak] Stop requested; will exit after current attestation and between-preset checks.');
  };
  process.on('SIGINT', onStop);
  process.on('SIGTERM', onStop);

  const failByCode: Record<string, FailByCodeEntry> = {};
  let totalSuccess = 0;
  let totalFail = 0;
  let completedRounds = 0;
  let sumProofDurationMs = 0;
  const lastResults: ResultRow[] = [];
  const attestations: AttestationRecord[] = [];

  const appendLog = (row: ResultRow): void => {
    if (!logPath) {
      return;
    }
    const line = `${JSON.stringify(row)}\n`;
    try {
      const resolved = path.isAbsolute(logPath) ? logPath : path.join(process.cwd(), logPath);
      fs.appendFileSync(resolved, line, { encoding: 'utf8' });
    } catch (e) {
      console.error('[soak] SOAK_LOG_PATH append failed:', e);
    }
  };

  const pushResult = (row: ResultRow): void => {
    sumProofDurationMs += row.durationMs;
    lastResults.push(row);
    if (lastResults.length > LAST_RESULTS_CAP) {
      lastResults.splice(0, lastResults.length - LAST_RESULTS_CAP);
    }
    appendLog(row);
  };

  const buildSummaryPayload = () => {
    const total = totalSuccess + totalFail;
    const successRatePct = total === 0 ? 0 : (100 * totalSuccess) / total;
    const avgProofDurationMs = total === 0 ? 0 : Number((sumProofDurationMs / total).toFixed(2));
    return {
      runStartedAt: runStartedAtIso,
      runStamp: runStampFs,
      endedAt: new Date().toISOString(),
      completedRounds,
      totalProofs: total,
      totalSuccess,
      totalFail,
      successRatePct: Number(successRatePct.toFixed(4)),
      avgProofDurationMs,
      failByCode: snapshotFailByCode(failByCode),
      lastResults: [...lastResults],
      attestations,
    };
  };

  /** Same counters as summary but no attestation bodies — safe to rewrite often while running. */
  const buildProgressPayload = () => {
    const total = totalSuccess + totalFail;
    const successRatePct = total === 0 ? 0 : (100 * totalSuccess) / total;
    const avgProofDurationMs = total === 0 ? 0 : Number((sumProofDurationMs / total).toFixed(2));
    return {
      runStartedAt: runStartedAtIso,
      runStamp: runStampFs,
      partial: true,
      progressSnapshotAt: new Date().toISOString(),
      completedRounds,
      totalProofs: total,
      totalSuccess,
      totalFail,
      successRatePct: Number(successRatePct.toFixed(4)),
      avgProofDurationMs,
      failByCode: snapshotFailByCode(failByCode),
      lastResults: [...lastResults],
      attestationsCount: attestations.length,
    };
  };

  const printSummary = (): void => {
    const payload = buildSummaryPayload();
    const total = payload.totalProofs;
    const rate = payload.successRatePct;
    console.log('\n========== soak summary ==========');
    console.log(`completedRounds: ${completedRounds}`);
    console.log(
      `total proofs: ${total}, success: ${totalSuccess}, fail: ${totalFail}, successRate: ${rate.toFixed(2)}%, avgProofDurationMs: ${payload.avgProofDurationMs}`
    );
    console.log('failByCode:', JSON.stringify(payload.failByCode));
    console.log('lastResults (up to ' + LAST_RESULTS_CAP + ' in memory; file has full list if written):');
    console.log(JSON.stringify(lastResults, null, 2));
    console.log(`attestations captured: ${attestations.length}`);
    console.log('==================================\n');
  };

  const writeSummaryFile = (): void => {
    if (!summaryPath) {
      return;
    }
    try {
      const payload = buildSummaryPayload();
      writeJsonFile(summaryPath, payload);
      console.log(`[soak] summary written to ${summaryPath}`);
    } catch (e) {
      console.error('[soak] SOAK_SUMMARY_PATH write failed:', e);
    }
  };

  const writeProgressFile = (): void => {
    if (!progressPath) {
      return;
    }
    try {
      writeJsonFile(progressPath, buildProgressPayload());
    } catch (e) {
      console.error('[soak] SOAK_PROGRESS_PATH write failed:', e);
    }
  };

  const zk = new PrimusCoreTLS();
  const initRes = await zk.init(appId, appSecret, 'wasm');
  console.log('[soak] init:', initRes);
  const haltCodesLog =
    haltOnErrorCodes.size > 0 ? ` haltOnErrorCodes=${[...haltOnErrorCodes].join(',')}` : '';
  console.log(
    `[soak] runStamp=${runStampFs} maxRounds=${maxRounds === 0 ? '∞' : String(maxRounds)} timeoutMs=${timeoutMs} intervalMs=${intervalMs} presets=${SOAK_PRESETS.length} log=${logPath || '(off)'} progress=${progressPath || '(off)'} summary=${summaryPath || '(off)'}${haltCodesLog}`
  );
  if (progressPath) {
    console.log(
      `[soak] live stats: open ${progressPath} read-only while running (refreshed after each proof; do not save editor buffer over this file)`
    );
  }

  writeProgressFile();

  try {
    while (!stopRequested) {
      if (maxRounds > 0 && completedRounds >= maxRounds) {
        break;
      }

      const round = completedRounds;
      for (let pi = 0; pi < SOAK_PRESETS.length; pi++) {
        if (stopRequested) {
          break;
        }
        const preset = SOAK_PRESETS[pi]!;
        const merged = mergePresetRequests(preset, pi + 1);
        const t = new Date().toISOString();
        const proofStarted = performance.now();

        try {
          const out = await runOneProof(zk, preset, merged, timeoutMs);
          const durationMs = proofElapsedMs(proofStarted);
          if (out.ok) {
            totalSuccess += 1;
            attestations.push({
              t,
              round,
              presetIndex: pi,
              presetName: preset.name,
              verified: true,
              attestation: out.attestation,
            });
            const row: ResultRow = {
              t,
              round,
              presetIndex: pi,
              presetName: preset.name,
              status: 'success',
              durationMs,
            };
            pushResult(row);
            console.log(`[soak] round=${round} preset=${pi} (${preset.name}) OK`);
          } else {
            totalFail += 1;
            const { code, message } = out;
            bumpFailByCode(failByCode, code, preset.name);
            const row: ResultRow = {
              t,
              round,
              presetIndex: pi,
              presetName: preset.name,
              status: 'failed',
              durationMs,
              code,
              message,
            };
            pushResult(row);
            const failLogLine = `[soak] round=${round} preset=${pi} (${preset.name}) FAIL code=${code} msg=${message}`;
            console.log(failLogLine);
            if (out.attestation !== undefined) {
              attestations.push({
                t,
                round,
                presetIndex: pi,
                presetName: preset.name,
                verified: false,
                attestation: out.attestation,
              });
            }
            const haltCodeNorm = String(code).trim();
            if (haltOnErrorCodes.has(haltCodeNorm)) {
              const matchedLogLine = `[soak] Matched SOAK_HALT_ON_ERROR_CODES (${haltCodeNorm}); no further proofs. Progress (and summary if enabled) still written in finally.`;
              haltForErrorCode = true;
              stopRequested = true;
              console.log(matchedLogLine);
            }
          }
        } catch (e) {
          const durationMs = proofElapsedMs(proofStarted);
          const { code, message } = parseErr(e);
          totalFail += 1;
          bumpFailByCode(failByCode, code, preset.name);
          const row: ResultRow = {
            t,
            round,
            presetIndex: pi,
            presetName: preset.name,
            status: 'failed',
            durationMs,
            code,
            message,
          };
          pushResult(row);
          const failLogLine = `[soak] round=${round} preset=${pi} (${preset.name}) FAIL code=${code} msg=${message}`;
          console.log(failLogLine);
          const haltCodeNorm = String(code).trim();
          if (haltOnErrorCodes.has(haltCodeNorm)) {
            const matchedLogLine = `[soak] Matched SOAK_HALT_ON_ERROR_CODES (${haltCodeNorm}); no further proofs. Progress (and summary if enabled) still written in finally.`;
            haltForErrorCode = true;
            stopRequested = true;
            console.log(matchedLogLine);
          }
        }

        writeProgressFile();

        if (intervalMs > 0 && !stopRequested) {
          await sleep(intervalMs);
        }
      }

      if (stopRequested) {
        break;
      }
      completedRounds += 1;
      console.log(`[soak] finished round ${completedRounds - 1}, totalSuccess=${totalSuccess} totalFail=${totalFail}`);
    }
  } finally {
    printSummary();
    writeProgressFile();
    writeSummaryFile();
  }

  if (haltForErrorCode) {
    if (process.stdin.isTTY) {
      console.log('[soak] Process kept alive for log review. Press Enter to exit.');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        await rl.question('');
      } finally {
        rl.close();
      }
    } else {
      console.log('[soak] Non-TTY stdin: not waiting for input; exiting.');
    }
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('[soak] fatal:', e);
  process.exit(1);
});
