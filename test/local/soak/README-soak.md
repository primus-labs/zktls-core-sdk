# Soak runner (local-only, gitignored under `local/`)

Local stress test: **one** `PrimusCoreTLS.init`, then repeatedly runs **5 presets** in order (`local/soak/soak-presets.ts`), round after round. Same flow as `test/index.test.ts` (`generateRequestParams` → `setAttMode` → `startAttestation` → `verifyAttestation`).

Presets are generated from `local/soak/listdao/<source>/params.json` (variables `presetGithub`, `presetSteam`, `presetBinance`, `presetAmazon`, `presetOkx`). To refresh after editing those JSON files:

```bash
node test/local/soak/scripts/gen-soak-presets.mjs
```

(`amazon/jp/params.json` is not wired into the five presets.)

Run from the **repository root** (`zktls-core-sdk/`).

## Prerequisites

- `npm run build` (native + `dist`) before first run or after changing `src/`.
- `.env` in the repo root (same as Jest) with at least:

```bash
ZKTLS_APP_ID=...
ZKTLS_APP_SECRET=...
```

## Commands

```bash
# Build then run all five presets in order (see SOAK_MAX_ROUNDS; default progress under test/local/soak/summary/)
npm run soak

# Skip rebuild (use after a successful npm run build)
npm run soak:dev

# One datasource only (open five terminals and run different scripts in parallel if you want)
npm run soak:okx
npm run soak:binance
# … also: soak:github, soak:steam, soak:amazon
# Dev variants without rebuild: soak:dev:okx, soak:dev:binance, etc.

# Stop on first failure with code 00002; keep terminal open until Enter (see SOAK_HALT_ON_ERROR_CODES)
SOAK_HALT_ON_ERROR_CODES=00002 npm run soak:dev
```

Default **live** progress: `npm run soak` (all presets) → `test/local/soak/summary/soak-progress-<China-time>.json` (no `<source>` in the filename). `npm run soak:okx` (etc.) → `soak-progress-<source>-<China-time>.json` so parallel single-source runs do not overwrite each other.

To merge **all** `soak-progress-*.json` snapshots in that folder into one rollup (`totalProofs`, `totalSuccess`, `totalFail`, `failByCode`), run:

```bash
npm run soak:aggregate-summary
```

Output: `test/local/soak/summary/soak-progress-aggregated.json`. Only inputs whose names **start with** `soak-progress-` and end with `.json` are counted (the aggregated file itself is excluded).

Equivalent manual invocation:

```bash
npm run build && ts-node --project test/local/tsconfig.scripts.json test/local/soak/soak-proofs.ts
# optional trailing arg: github | steam | binance | amazon | okx
```

Stop with **Ctrl+C** (SIGINT). A summary prints in `finally` (after the current `startAttestation` finishes). A **summary JSON file** is written only if you set `SOAK_SUMMARY_PATH` (see below).

While the process is running, open the **progress file path printed at startup** (default base `local/soak/summary/soak-progress.json` → actual name includes a **China run-start timestamp**, e.g. `local/soak/summary/soak-progress-2026-03-21T10-24-31-289.json`) **read-only** to see live counts and `lastResults`. That path is fixed when the process starts, so if the run **crashes**, the last written snapshot remains on disk. The file is **replaced after each proof** (`writeFileSync`). Avoid **saving** the editor buffer onto that path.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ZKTLS_APP_ID` | yes | App id |
| `ZKTLS_APP_SECRET` | yes | App secret |
| `SOAK_MAX_ROUNDS` | no | Max **rounds** (each round = all presets in `SOAK_PRESETS`). Default matches `DEFAULT_MAX_ROUNDS` in `soak-proofs.ts`. Set **`0`** for **infinite** until SIGINT |
| `SOAK_ATTEST_TIMEOUT_MS` | no | Per-attestation timeout (default matches `soak-proofs.ts`, currently 1 minute unless overridden) |
| `SOAK_REQUEST_INTERVAL_MS` | no | Delay **after each proof** in ms (default **10000** = 10s). Set **`0`** for no delay |
| `SOAK_PRESET_<n>_HEADERS_JSON` | no | `n` = `1`…`5`. JSON object merged into **every** request header for that preset (e.g. `Cookie`) |
| `SOAK_LOG_PATH` | no | Append **one JSON line per proof** (JSON Lines) for durability |
| `SOAK_CALL_ALGORITHM_LOG` | no | **Default on.** Re-runs the soak in a **child** process with stdout/stderr **piped** (so native writes to fd 1/2 are captured), forwards output to your terminal, and for each `callAlgorithm output:` line parses JSON: **only if `retcode` is `2`** (number, or string `"2"` after trim) appends one `{ retcode, retdesc, details }` line to **`callAlgorithm-output-<runStamp>.jsonl`** when running **all** presets (`npm run soak`), or **`callAlgorithm-output-<source>-<runStamp>.jsonl`** when a single CLI source is set; same pattern for **raw** `.log`. Set **`0`** / **`false`** / **`off`** to disable (no subprocess wrapper). With `SOAK_USE_SUBPROCESS_CAPTURE=0` capture falls back to patching Node `write` only (may miss native `printf`) |
| `SOAK_CALL_ALGORITHM_RAW_LOG` | no | **Default on.** When **`retcode`** is **`2`**, also appends the **full** `callAlgorithm output` line to `callAlgorithm-raw-*.log`. Set **`0`** / **`false`** / **`off`** for jsonl-only |
| `SOAK_CALL_ALGORITHM_LOG_DIR` | no | Directory for `.log` / `.jsonl` (default `test/local/soak/summary`) |
| `SOAK_USE_SUBPROCESS_CAPTURE` | no | **Default on** when `SOAK_CALL_ALGORITHM_LOG` is on. Set **`0`** / **`false`** / **`off`** to run in-process with Node `write` hooks only |
| `SOAK_PROGRESS_PATH` | no | Base path for **live** stats JSON, rewritten after **each proof**. Default `test/local/soak/summary/soak-progress.json` (directory created as needed). A **run-start timestamp** (China **Asia/Shanghai**) is inserted before the extension, e.g. `soak-progress-2026-03-21T10-24-31-289.json`. Set to **empty string** to disable |
| `SOAK_SUMMARY_PATH` | no | Base path for the end-of-run **full summary JSON** (includes `attestations` bodies). **Unset** = **no file** (terminal summary only). Set to a path (e.g. `local/soak/my-summary.json`) to enable; a **run-start** China timestamp is inserted before the extension. Set to **empty string** to explicitly disable |
| `SOAK_HALT_ON_ERROR_CODES` | no | Comma-separated failure **`code`** values (as in progress JSON / terminal `FAIL code=…`). If a proof fails with a listed code, the runner **stops scheduling further proofs**, still runs **`finally`** (progress write, and summary file if `SOAK_SUMMARY_PATH` is set), then **keeps the process alive** on an interactive TTY until you press **Enter** (so you can read the log). **Unset or empty** = disabled (original infinite / `SOAK_MAX_ROUNDS` behavior). Example: `SOAK_HALT_ON_ERROR_CODES=00002` or `00002,30001`. **SIGINT** also stops the run and writes `finally`, but does **not** wait for Enter |

### Summary file contents (only when `SOAK_SUMMARY_PATH` is set)

- **`runStartedAt`** (ISO UTC) and **`runStamp`** (same China wall-time token as in the filename, e.g. `2026-03-21T10-24-31-289`) — identical to the progress file for this run when both are enabled; use them to pair files without guessing from `endedAt` / `progressSnapshotAt`
- `endedAt` (when the runner exited and wrote the summary), `completedRounds`, `totalProofs`, `totalSuccess`, `totalFail`, `successRatePct`, **`avgProofDurationMs`** (mean of each proof’s `durationMs` over **all** completed proofs, two decimal places), **`failByCode`**: per error code, `{ total, details }` where **`total`** is how many failures used that code and **`details`** maps **`presetName` → count** (e.g. `"30001": { "total": 4, "details": { "listdao_github": 1, "listdao_steam": 3 } }`)
- `lastResults`: every row (time `t`, round, preset, status, **`durationMs`** from proof start through `runOneProof` completion, optional `code` / `message`)
- `attestations`: full **JSON-serialized** attestation per run where `startAttestation` returned a value — `verified: true` if `verifyAttestation` passed, `verified: false` if verify failed (attestation body still included). Runs that **throw** before a return are not listed here.

### Progress file (`SOAK_PROGRESS_PATH`, default under `test/local/soak/summary/`)

- **`runStartedAt`** and **`runStamp`** — same values as the summary file for this run when a summary path is configured (script / `main()` start)
- `partial: true`, `progressSnapshotAt` (time **this snapshot** was written; changes every proof), same numeric stats (including **`avgProofDurationMs`**), same **`failByCode`** shape as summary, and `lastResults` as above
- `attestationsCount`: number of attestation records so far (bodies only appear in the final summary file)

### Native `callAlgorithm output` capture

- **Full soak** (`npm run soak`): **`callAlgorithm-raw-<runStamp>.log`** / **`callAlgorithm-output-<runStamp>.jsonl`** (no `<source>` segment).
- **Single source** (`npm run soak:github`, …): **`callAlgorithm-raw-<source>-<runStamp>.log`** / **`callAlgorithm-output-<source>-<runStamp>.jsonl`**.
- Only when **`retcode`** is **`2`** (number or string `"2"`) — raw line is **full** native line; jsonl is one object per line with **`retcode`**, **`retdesc`**, **`details`** only (`retdesc` string, `details` may be `null`)

With the default **piped subprocess** wrapper, lines that only go through native **`printf`/fd** in the child are still read from the pipe. In-process mode (`SOAK_USE_SUBPROCESS_CAPTURE=0`) patches Node `write` only and **may** miss those lines; shell **`tee`** remains a blunt fallback for full transcripts.

### Example: extra JSONL log + custom summary path

```bash
SOAK_LOG_PATH=./soak-results.jsonl SOAK_SUMMARY_PATH=./my-summary.json npm run build && node -r ts-node/register --project test/local/tsconfig.scripts.json test/local/soak/soak-proofs.ts
```

### Example: long soak (infinite rounds)

```bash
SOAK_MAX_ROUNDS=0 npm run build && node -r ts-node/register --project test/local/tsconfig.scripts.json test/local/soak/soak-proofs.ts
```

## Presets (`soak-presets.ts`)

`presetGithub`, `presetSteam`, `presetBinance`, `presetAmazon`, `presetOkx` are generated from `local/soak/listdao/<source>/params.json` (see `local/soak/scripts/gen-soak-presets.mjs`):

| Variable | `listdao` folder | `params.json` path |
|----------|------------------|--------------------|
| `presetGithub` | `github` | `listdao/github/params.json` |
| `presetSteam` | `steam` | `listdao/steam/params.json` |
| `presetBinance` | `binance` | `listdao/binance/params.json` |
| `presetAmazon` | `amazon` | `listdao/amazon/params.json` |
| `presetOkx` | `okx` | `listdao/okx/params.json` |

`listdao/amazon/jp/params.json` is not included in the five presets. Refresh after editing listdao JSON:

```bash
node test/local/soak/scripts/gen-soak-presets.mjs
```

## Customizing presets

Edit `local/soak/soak-presets.ts` (URLs, headers, `responseResolves`, `attMode`, `noProxy`).

## Output

- **Terminal**: live `OK` / `FAIL` lines, round totals, then a short text summary.
- **`SOAK_PROGRESS_PATH`** (default `local/soak/summary/soak-progress.json`): **while running**, counters and `lastResults`, plus `partial: true` and `attestationsCount` — rewritten after **each proof** to a run-specific file (`…-<China-time>.json` at **process start**). Open **read-only**; survives **crash** up to the last successful write.
- **`SOAK_SUMMARY_PATH`**: optional; at **exit**, one pretty-printed JSON with stats, `lastResults`, and full `attestations`. Filename uses the **same run-start China timestamp** as progress when both are enabled.
- **`SOAK_LOG_PATH`** (optional): JSON Lines, one object per proof (lightweight rows, no full attestation).

#### exit
- pkill -9 -f soak-proofs