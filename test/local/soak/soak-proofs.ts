/**
 * Soak runner: cycles through SOAK_PRESETS in order, round after round.
 * See test/local/soak/README-soak.md for environment variables.
 *
 * Optional CLI arg: datasource key `github` | `steam` | `binance` | `amazon` | `okx`
 * `npm run soak:github` … `npm run soak:okx`: progress + callAlgorithm logs include `-<source>-` before the run stamp.
 * `npm run soak` (all presets): progress is `soak-progress-<stamp>.json`; callAlgorithm files are `callAlgorithm-*-<stamp>.*` (no source segment).
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import * as readline from 'readline/promises';
import * as dotenv from 'dotenv';
import { PrimusCoreTLS } from '../../../src/index';
import {
  SOAK_PRESETS,
  SOAK_PRESET_BY_SOURCE,
  SOAK_PRESET_SOURCES,
  type SoakPreset,
  type SoakPresetSource,
} from './soak-presets';
import type { AttNetworkRequest, Attestation } from '../../../src/index.d';

dotenv.config();

const nodeRequire = createRequire(__filename);
const SOAK_TS_NODE_PROJECT = path.resolve(process.cwd(), 'test/local/tsconfig.scripts.json');
/** Loaded before SDK so `PRIMUS_SDK_ENV` defaults to test for soak (see package.json soak scripts). */
const PRIMUS_SOAK_ENV_REGISTER = path.resolve(process.cwd(), 'test/local/soak/register-primus-test-env.cjs');

/** Args after `soak-proofs.ts` (e.g. `github`), for respawning the same soak from the pipe parent. */
function soakForwardedCliArgs(): string[] {
  const norm = (s: string) => s.replace(/\\/g, '/');
  const idx = process.argv.findIndex((a) => norm(a).endsWith('soak-proofs.ts'));
  if (idx >= 0) {
    return process.argv.slice(idx + 1);
  }
  return [];
}

const LAST_RESULTS_CAP = 200;

/** Default rounds: 1 (presets 0–4 once). Set SOAK_MAX_ROUNDS=0 for infinite. */
const DEFAULT_MAX_ROUNDS = 10000;

/** Progress JSON under `test/local/soak/summary/` by default (paths relative to repo root / `cwd`). */
const DEFAULT_PROGRESS_PATH = 'test/local/soak/summary/soak-progress.json';

/** Native line marker; JSON after this is written only if `retcode` is **2** (number or `"2"`). */
const CALL_ALGORITHM_OUTPUT_MARKER = 'callAlgorithm output:';

/** Only `retcode` **2** is persisted to `callAlgorithm-output-*.jsonl` (and optional raw line). */
function normalizeCallAlgorithmRetcode2(rc: unknown): '2' | null {
  if (rc === 2) {
    return '2';
  }
  if (typeof rc === 'string' && rc.trim() === '2') {
    return '2';
  }
  return null;
}

const DEFAULT_CALL_ALGORITHM_LOG_DIR = 'test/local/soak/summary';

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

function parseEnvBool(name: string, defaultVal: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === '') {
    return defaultVal;
  }
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') {
    return false;
  }
  return true;
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

function isSoakPresetSource(s: string): s is SoakPresetSource {
  return (SOAK_PRESET_SOURCES as readonly string[]).includes(s);
}

/** Maps `listdao_github` → `SOAK_PRESET_1_HEADERS_JSON`, … `listdao_okx` → `_5`. */
function presetNameToOneBased(preset: SoakPreset): number {
  const prefix = 'listdao_';
  if (!preset.name.startsWith(prefix)) {
    return 1;
  }
  const key = preset.name.slice(prefix.length);
  if (!isSoakPresetSource(key)) {
    return 1;
  }
  const i = SOAK_PRESET_SOURCES.indexOf(key);
  return i >= 0 ? i + 1 : 1;
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

function presetToLogSource(preset: SoakPreset): string {
  const prefix = 'listdao_';
  if (preset.name.startsWith(prefix)) {
    return preset.name.slice(prefix.length);
  }
  return preset.name;
}

/** Parent-parsed line: child emits this immediately before each proof so datasource matches native logs. */
const SOAK_PROOF_DS_PREFIX = '[soak] __proof_ds__=';

function createCallAlgorithmLineSink(opts: {
  summaryDir: string;
  runStampFs: string;
  /** Sanitized filename segment before `<runStamp>`; empty → `callAlgorithm-raw-<stamp>.log` (full soak). */
  getFileTag: () => string;
  rawLinesEnabled: boolean;
}): (line: string) => void {
  const resolvedDir = path.isAbsolute(opts.summaryDir)
    ? opts.summaryDir
    : path.join(process.cwd(), opts.summaryDir);

  return (line: string): void => {
    const idx = line.indexOf(CALL_ALGORITHM_OUTPUT_MARKER);
    if (idx < 0) {
      return;
    }

    const jsonStr = line.slice(idx + CALL_ALGORITHM_OUTPUT_MARKER.length).trim();
    if (!jsonStr) {
      return;
    }
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      return;
    }

    const retcode2 = normalizeCallAlgorithmRetcode2(obj.retcode);
    if (!retcode2) {
      return;
    }

    const tag = opts.getFileTag().trim().replace(/[^a-z0-9_-]/gi, '_');
    const rawBase = tag ? `callAlgorithm-raw-${tag}-${opts.runStampFs}.log` : `callAlgorithm-raw-${opts.runStampFs}.log`;
    const jsonlBase = tag
      ? `callAlgorithm-output-${tag}-${opts.runStampFs}.jsonl`
      : `callAlgorithm-output-${opts.runStampFs}.jsonl`;
    try {
      fs.mkdirSync(resolvedDir, { recursive: true });
    } catch (e) {
      console.error('[soak] callAlgorithm log dir failed:', e);
      return;
    }

    if (opts.rawLinesEnabled) {
      try {
        const rawFile = path.join(resolvedDir, rawBase);
        fs.appendFileSync(rawFile, `${line}\n`, 'utf8');
      } catch (e) {
        console.error('[soak] callAlgorithm-raw log append failed:', e);
      }
    }

    const record: { retcode: string; retdesc: string; details: unknown } = {
      retcode: retcode2,
      retdesc: obj.retdesc == null ? '' : String(obj.retdesc),
      details: obj.details ?? null,
    };
    try {
      const file = path.join(resolvedDir, jsonlBase);
      fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
    } catch (e) {
      console.error('[soak] callAlgorithm-output log append failed:', e);
    }
  };
}

function createLineBufferTap(onLine: (line: string) => void): {
  push: (chunk: string) => void;
  flush: () => void;
} {
  let rest = '';
  return {
    push(chunk: string): void {
      rest += chunk;
      let nl: number;
      while ((nl = rest.indexOf('\n')) >= 0) {
        const line = rest.slice(0, nl);
        rest = rest.slice(nl + 1);
        onLine(line);
      }
    },
    flush(): void {
      if (rest.length > 0) {
        onLine(rest);
        rest = '';
      }
    },
  };
}

/**
 * - Parsed JSON on each `callAlgorithm output:…` line must have **`retcode`** **2** (number, or string `"2"` only after trim).
 * - When that holds → append **full line** to `callAlgorithm-raw-*.log` if enabled, and one `{ retcode, retdesc, details }`
 *   line to `callAlgorithm-output-<runStamp>.jsonl` (full soak) or `callAlgorithm-output-<source>-<runStamp>.jsonl` (single CLI source).
 *
 * Native code that writes directly to fd 1/2 may not be visible here (only bytes that go through Node's stream.write).
 */
function installCallAlgorithmOutputCapture(opts: {
  summaryDir: string;
  runStampFs: string;
  getFileTag: () => string;
  enabled: boolean;
  /** Append full matching lines to `callAlgorithm-raw-*.log` (default true). */
  rawLinesEnabled: boolean;
}): () => void {
  if (!opts.enabled) {
    return (): void => {};
  }
  const handleLine = createCallAlgorithmLineSink({
    summaryDir: opts.summaryDir,
    runStampFs: opts.runStampFs,
    getFileTag: opts.getFileTag,
    rawLinesEnabled: opts.rawLinesEnabled,
  });

  const makeTap = (buf: { rest: string }) => {
    return (chunk: string): void => {
      buf.rest += chunk;
      let nl: number;
      while ((nl = buf.rest.indexOf('\n')) >= 0) {
        const line = buf.rest.slice(0, nl);
        buf.rest = buf.rest.slice(nl + 1);
        handleLine(line);
      }
    };
  };

  const outBuf = { rest: '' };
  const errBuf = { rest: '' };
  const tapOut = makeTap(outBuf);
  const tapErr = makeTap(errBuf);

  const patch = (stream: NodeJS.WriteStream & { write: typeof process.stdout.write }, tap: (s: string) => void) => {
    const orig = stream.write.bind(stream);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stream.write = function (chunk: any, encoding?: any, cb?: any): boolean {
      let s = '';
      if (typeof chunk === 'string') {
        s = chunk;
      } else {
        s = Buffer.from(chunk).toString(
          typeof encoding === 'string' && Buffer.isEncoding(encoding) ? encoding : 'utf8'
        );
      }
      if (s) {
        tap(s);
      }
      return orig(chunk, encoding, cb);
    };
    return (): void => {
      stream.write = orig;
    };
  };

  const restoreOut = patch(process.stdout, tapOut);
  const restoreErr = patch(process.stderr, tapErr);
  return (): void => {
    restoreOut();
    restoreErr();
  };
}

/**
 * Re-spawns this script with stdout/stderr piped so native writes to fd 1/2 are captured (same process fds → pipe).
 * Forwards captured bytes to the terminal and applies the same callAlgorithm file rules as {@link installCallAlgorithmOutputCapture}.
 */
async function runSoakWithPipedChild(): Promise<void> {
  const soakRunStarted = new Date();
  const runStampFs = formatChinaWallTimeForFilename(soakRunStarted);
  const runStartedAtIso = soakRunStarted.toISOString();

  const callAlgorithmLogEnabled = parseEnvBool('SOAK_CALL_ALGORITHM_LOG', true);
  const callAlgorithmRawLogEnabled = parseEnvBool('SOAK_CALL_ALGORITHM_RAW_LOG', true);
  const callAlgorithmLogDir =
    process.env.SOAK_CALL_ALGORITHM_LOG_DIR?.trim() || DEFAULT_CALL_ALGORITHM_LOG_DIR;

  /** Child argv after script: empty ⇒ `npm run soak` (flat callAlgorithm filenames). */
  const flatCallAlgorithmFiles = soakForwardedCliArgs().length === 0;
  let algoLogDatasource = 'all';
  const sinkLineHandler = callAlgorithmLogEnabled
    ? createCallAlgorithmLineSink({
        summaryDir: callAlgorithmLogDir,
        runStampFs,
        getFileTag: () => (flatCallAlgorithmFiles ? '' : algoLogDatasource.trim().replace(/[^a-z0-9_-]/gi, '_')),
        rawLinesEnabled: callAlgorithmRawLogEnabled,
      })
    : (): void => {};
  const outTap = createLineBufferTap(sinkLineHandler);
  const errTap = createLineBufferTap(sinkLineHandler);

  const tryParentLineMeta = (line: string): boolean => {
    if (line.startsWith(SOAK_PROOF_DS_PREFIX)) {
      algoLogDatasource = line.slice(SOAK_PROOF_DS_PREFIX.length).trim() || 'all';
      return true;
    }
    const stampNeedle = '[soak] runStamp=';
    if (line.startsWith(stampNeedle)) {
      const m = /\bdatasource=([^\s]+)/.exec(line);
      if (m?.[1]) {
        algoLogDatasource = m[1];
      }
      return false;
    }
    return false;
  };

  const forwardLine = (line: string, dest: NodeJS.WriteStream, tap: { push: (s: string) => void }): void => {
    if (tryParentLineMeta(line)) {
      return;
    }
    tap.push(`${line}\n`);
    dest.write(`${line}\n`);
  };

  const forwardChunk = (
    chunk: Buffer | string,
    dest: NodeJS.WriteStream,
    carry: { buf: string },
    tap: { push: (s: string) => void }
  ): void => {
    const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    carry.buf += s;
    let idx: number;
    while ((idx = carry.buf.indexOf('\n')) >= 0) {
      const line = carry.buf.slice(0, idx);
      carry.buf = carry.buf.slice(idx + 1);
      forwardLine(line, dest, tap);
    }
  };

  const outCarry = { buf: '' };
  const errCarry = { buf: '' };

  await new Promise<void>((resolve, reject) => {
    /**
     * Do not use `spawn(execPath, process.argv.slice(1))`: under `ts-node`, argv is not a `node …`
     * invocation, so the child can become `node soak-proofs.ts` and hit ERR_UNKNOWN_FILE_EXTENSION.
     */
    const childArgs = [
      '-r',
      PRIMUS_SOAK_ENV_REGISTER,
      '-r',
      nodeRequire.resolve('ts-node/register'),
      __filename,
      ...soakForwardedCliArgs(),
    ];
    const child = spawn(process.execPath, childArgs, {
      env: {
        ...process.env,
        SOAK_INTERNAL_RUN: '1',
        SOAK_RUN_STAMP_FS: runStampFs,
        SOAK_RUN_STARTED_AT_ISO: runStartedAtIso,
        TS_NODE_PROJECT: SOAK_TS_NODE_PROJECT,
      },
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    child.stdout?.on('data', (c: Buffer) => forwardChunk(c, process.stdout, outCarry, outTap));
    child.stderr?.on('data', (c: Buffer) => forwardChunk(c, process.stderr, errCarry, errTap));

    child.on('error', reject);
    child.on('close', (code, signal) => {
      const flushCarry = (tail: string, dest: NodeJS.WriteStream, tap: { push: (s: string) => void; flush: () => void }) => {
        if (!tail) {
          return;
        }
        if (tryParentLineMeta(tail)) {
          return;
        }
        tap.push(tail);
        tap.flush();
        dest.write(tail);
      };
      flushCarry(outCarry.buf, process.stdout, outTap);
      flushCarry(errCarry.buf, process.stderr, errTap);
      if (signal) {
        process.exitCode = 1;
      } else {
        process.exitCode = code ?? 0;
      }
      resolve();
    });
  });
}

function shouldUseSubprocessCapture(): boolean {
  if (process.env.SOAK_INTERNAL_RUN === '1') {
    return false;
  }
  const v = process.env.SOAK_USE_SUBPROCESS_CAPTURE?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') {
    return false;
  }
  return parseEnvBool('SOAK_CALL_ALGORITHM_LOG', true);
}

async function main(): Promise<void> {
  /**
   * One stamp for the whole run: native-child mode passes `SOAK_RUN_*` from the parent so progress/capture
   * filenames stay aligned; direct `main()` still generates a fresh stamp locally.
   */
  const soakRunStarted = new Date();
  const inheritedStamp = process.env.SOAK_RUN_STAMP_FS?.trim();
  const inheritedIso = process.env.SOAK_RUN_STARTED_AT_ISO?.trim();
  const runStampFs = inheritedStamp || formatChinaWallTimeForFilename(soakRunStarted);
  const runStartedAtIso = inheritedIso || soakRunStarted.toISOString();

  const isInternalChild = process.env.SOAK_INTERNAL_RUN === '1';

  const cliSource = process.argv[2]?.trim().toLowerCase();
  let singleSource: SoakPresetSource | undefined;
  if (cliSource) {
    if (!isSoakPresetSource(cliSource)) {
      throw new Error(
        `[soak] Unknown datasource "${process.argv[2]}". Use one of: ${SOAK_PRESET_SOURCES.join(', ')}`
      );
    }
    singleSource = cliSource;
  }
  const activePresets: readonly SoakPreset[] = singleSource
    ? [SOAK_PRESET_BY_SOURCE[singleSource]]
    : SOAK_PRESETS;

  /** Datasource label for `callAlgorithm-output-*.jsonl` while the current proof runs */
  let algoLogDatasource = singleSource ?? 'all';

  const appId = process.env.ZKTLS_APP_ID;
  const appSecret = process.env.ZKTLS_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('ZKTLS_APP_ID and ZKTLS_APP_SECRET must be set (e.g. in .env)');
  }

  const maxRounds = parseEnvInt('SOAK_MAX_ROUNDS', DEFAULT_MAX_ROUNDS);
  const timeoutMs = parseEnvInt('SOAK_ATTEST_TIMEOUT_MS', 15 * 60 * 1000);
  const intervalMs = parseEnvInt('SOAK_REQUEST_INTERVAL_MS', 60 * 1000);
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
    const progressBase =
      singleSource !== undefined
        ? `test/local/soak/summary/soak-progress-${singleSource}.json`
        : DEFAULT_PROGRESS_PATH;
    progressPath = pathWithRunStamp(progressBase, runStampFs);
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

  const callAlgorithmLogEnabled = parseEnvBool('SOAK_CALL_ALGORITHM_LOG', true);
  const callAlgorithmRawLogEnabled = parseEnvBool('SOAK_CALL_ALGORITHM_RAW_LOG', true);
  const callAlgorithmLogDir =
    process.env.SOAK_CALL_ALGORITHM_LOG_DIR?.trim() || DEFAULT_CALL_ALGORITHM_LOG_DIR;
  const callAlgorithmFileTag = (): string =>
    singleSource !== undefined ? singleSource.replace(/[^a-z0-9_-]/gi, '_') : '';

  const uninstallCallAlgorithmCapture = isInternalChild
    ? (): void => {}
    : installCallAlgorithmOutputCapture({
        summaryDir: callAlgorithmLogDir,
        runStampFs,
        getFileTag: callAlgorithmFileTag,
        enabled: callAlgorithmLogEnabled,
        rawLinesEnabled: callAlgorithmRawLogEnabled,
      });

  const zk = new PrimusCoreTLS();
  const initRes = await zk.init(appId, appSecret, 'wasm');
  console.log('[soak] init:', initRes);
  const haltCodesLog =
    haltOnErrorCodes.size > 0 ? ` haltOnErrorCodes=${[...haltOnErrorCodes].join(',')}` : '';
  console.log(
    `[soak] runStamp=${runStampFs} datasource=${singleSource ?? 'all'} presets=${activePresets.length} maxRounds=${maxRounds === 0 ? '∞' : String(maxRounds)} timeoutMs=${timeoutMs} intervalMs=${intervalMs} log=${logPath || '(off)'} progress=${progressPath || '(off)'} summary=${summaryPath || '(off)'}${haltCodesLog}`
  );
  if (progressPath) {
    console.log(
      `[soak] live stats: open ${progressPath} read-only while running (refreshed after each proof; do not save editor buffer over this file)`
    );
  }
  if (callAlgorithmLogEnabled) {
    const rawStem =
      singleSource !== undefined
        ? `callAlgorithm-raw-${singleSource}-${runStampFs}`
        : `callAlgorithm-raw-${runStampFs}`;
    const jsonlStem =
      singleSource !== undefined
        ? `callAlgorithm-output-${singleSource}-${runStampFs}`
        : `callAlgorithm-output-${runStampFs}`;
    const rawPart = callAlgorithmRawLogEnabled
      ? `retcode 2 only: full line → ${callAlgorithmLogDir}/${rawStem}.log`
      : 'raw off (SOAK_CALL_ALGORITHM_RAW_LOG=0)';
    console.log(
      `[soak] callAlgorithm: ${rawPart}; retcode 2 only: {retcode,retdesc,details} → ${callAlgorithmLogDir}/${jsonlStem}.jsonl (all off: SOAK_CALL_ALGORITHM_LOG=0)`
    );
  }

  writeProgressFile();

  try {
    while (!stopRequested) {
      if (maxRounds > 0 && completedRounds >= maxRounds) {
        break;
      }

      const round = completedRounds;
      for (let pi = 0; pi < activePresets.length; pi++) {
        if (stopRequested) {
          break;
        }
        const preset = activePresets[pi]!;
        algoLogDatasource = singleSource ?? presetToLogSource(preset);
        if (isInternalChild && singleSource !== undefined) {
          const m = `${SOAK_PROOF_DS_PREFIX}${algoLogDatasource}\n`;
          process.stdout.write(m);
          process.stderr.write(m);
        }
        const merged = mergePresetRequests(preset, presetNameToOneBased(preset));
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
    uninstallCallAlgorithmCapture();
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

async function entry(): Promise<void> {
  if (shouldUseSubprocessCapture()) {
    await runSoakWithPipedChild();
    return;
  }
  await main();
}

entry().catch((e) => {
  console.error('[soak] fatal:', e);
  process.exit(1);
});
