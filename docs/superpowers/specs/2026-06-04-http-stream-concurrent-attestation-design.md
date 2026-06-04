# HTTP Stream + Concurrent Attestation API 设计文档

## 背景

当前 SDK 的核心接口是 `startAttestation(input, timeout?, algoUrls?)`。它会先通过算法接口 `getAttestation(attParams)` 启动 attestation，再通过 `getAttestationResult(timeout)` 轮询最终结果。算法层当前是单任务状态机，不支持一个算法实例内同时运行多个 attestation。

HTTP stream 数据源又带来一个新需求：data source server 可能会在最终 zkTLS 证明生成前持续返回中间结果。SDK 需要把这些中间结果回调给开发者，同时最终仍然返回 `Attestation` 证明。

因此这里需要同时支持两件事：

- stream 模式：单次 attestation 过程中，把中间结果透传给开发者。
- 并发模式：SDK 允许开发者同时提交多个 attestation，但通过多个独立子进程隔离算法实例，避免破坏算法层单任务约束。

## 目标

- 保持已有 `startAttestation(input, timeout?, algoUrls?)` 调用完全兼容。
- 增加 `startAttestation(input, options)`，用于 stream、timeout、poll interval、algoUrls 等单次请求配置。
- 增加 `init(appId, appSecret, options)`，用于配置算法 backend 和并发度。
- 默认行为保持单进程、单任务，与当前 SDK 行为兼容。
- 当 `concurrency > 1` 时，通过多进程进程池提供并发，每个子进程内仍然一次只跑一个 attestation。
- 多进程 worker 按需懒启动，不在 `init` 阶段预先启动所有子进程。
- stream 中间结果必须按任务路由到对应 `startAttestation` 调用的 `onProgress` 回调。
- `startAttestation` 主返回值仍然是最终 `Attestation` 证明。

## 非目标

- 不要求算法层支持单实例并发。
- 不把 `startAttestation` 改造成只返回 event emitter、observable 或 async iterator 的接口。
- 不改变最终 `Attestation` 对象结构。
- 不要求非 stream 数据源返回中间状态。
- 不在单次 `startAttestation` 调用里动态调整全局并发度。
- 不把开发者暴露给子进程、worker id、任务队列等内部概念。

## 核心原则

单个算法实例仍然是串行的。SDK 的并发来自多个独立子进程，每个子进程加载一份独立算法 runtime。

```text
concurrency = 1
  PrimusCoreTLS
    -> LocalAlgorithmRunner
         -> algorithm singleton

concurrency > 1
  PrimusCoreTLS
    -> ProcessAlgorithmPool
         -> child process 1 -> algorithm singleton
         -> child process 2 -> algorithm singleton
         -> up to child process N, started lazily
```

stream 是单次请求行为，并发是 SDK runtime 资源配置。因此：

- `init(..., { concurrency })` 管资源和并发。
- `startAttestation(..., { stream, onProgress })` 管单次请求行为。

## 对外接口

### Init Options

保留旧接口：

```ts
async init(
  appId: string,
  appSecret?: string,
  mode?: AlgorithmBackend
): Promise<string | boolean>;
```

新增 options 形式：

```ts
export type AlgorithmBackend = 'auto' | 'native' | 'wasm';

export type PrimusInitOptions = {
  backend?: AlgorithmBackend;
  concurrency?: number;
};

async init(
  appId: string,
  appSecret?: string,
  options?: AlgorithmBackend | PrimusInitOptions
): Promise<string | boolean>;
```

默认值：

- `backend: 'auto'`
- `concurrency: 1`

兼容规则：

```ts
await client.init(appId, appSecret);
await client.init(appId, appSecret, 'native');
await client.init(appId, appSecret, { backend: 'native', concurrency: 3 });
```

当 `concurrency <= 1` 时，SDK 使用本进程算法实例，并保持当前 `_isAttesting` 单任务保护行为。当 `concurrency > 1` 时，SDK 只保存进程池配置，不在 `init` 阶段 fork 子进程；worker 在第一次任务需要时按需启动。

### Start Attestation Options

保留旧 positional 参数：

```ts
async startAttestation(
  input: StartAttestationInput,
  timeout?: number,
  algoUrls?: Pick<AlgorithmUrls, 'primusMpcUrl' | 'primusProxyUrl' | 'proxyUrl'>
): Promise<Attestation>;
```

新增 options 形式：

```ts
export type StartAttestationOptions = {
  timeout?: number;
  algoUrls?: Pick<AlgorithmUrls, 'primusMpcUrl' | 'primusProxyUrl' | 'proxyUrl'>;
  stream?: boolean;
  pollIntervalMs?: number;
  onProgress?: (event: AttestationProgressEvent) => void | Promise<void>;
  abortOnProgressError?: boolean;
};

async startAttestation(
  input: StartAttestationInput,
  options?: StartAttestationOptions
): Promise<Attestation>;
```

默认值：

- `timeout: 2 * 60 * 1000`
- `stream: false`
- `pollIntervalMs: 500`
- `abortOnProgressError: false`

开发者示例：

```ts
await client.init(appId, appSecret, {
  backend: 'native',
  concurrency: 3,
});

const attestation = await client.startAttestation(attRequest, {
  timeout: 10 * 60 * 1000,
  stream: true,
  onProgress: (event) => {
    if (event.type === 'stream-data') {
      console.log(event.requestId, event.data);
    }
  },
});
```

并发调用示例：

```ts
const results = await Promise.all([
  client.startAttestation(req1, { stream: true, onProgress: handleReq1Progress }),
  client.startAttestation(req2, { stream: true, onProgress: handleReq2Progress }),
  client.startAttestation(req3, { stream: false }),
]);
```

## Progress Event 类型

```ts
export type AttestationProgressEvent =
  | {
      type: 'stream-data';
      requestId: string;
      sequence?: number;
      data: unknown;
      raw: unknown;
    }
  | {
      type: 'proof-ready';
      requestId: string;
      raw: unknown;
    }
  | {
      type: 'error';
      requestId: string;
      error: ZkAttestationError | Error;
      raw?: unknown;
    };
```

事件语义：

- `stream-data`：data source server 返回了中间结果。
- `proof-ready`：最终证明已经可用，SDK 即将 resolve `startAttestation`。
- `error`：attestation 流程失败，SDK 即将 reject。

`stream-data.data` 的结构由 data source server 决定，SDK 不做业务解析，只透传给开发者。

## 内部抽象

引入统一 runner 抽象，让 `PrimusCoreTLS` 不直接依赖本进程算法单例。

```ts
type AlgorithmRunnerInitOptions = {
  backend: AlgorithmBackend;
};

type RunAttestationOptions = {
  timeout: number;
  pollIntervalMs: number;
  onResult?: (result: unknown) => void | Promise<void>;
};

interface AlgorithmRunner {
  init(options: AlgorithmRunnerInitOptions): Promise<string | boolean>;
  runAttestation(
    attParams: unknown,
    options: RunAttestationOptions
  ): Promise<unknown>;
  close?(): Promise<void>;
}
```

### LocalAlgorithmRunner

`LocalAlgorithmRunner` 包装当前 `primus_zk.ts` 的能力：

```text
init()
  -> initAlgorithm()
  -> setLogLevel
  -> init

runAttestation(attParams)
  -> getAttestation(attParams)
  -> getAttestationResult({ timeout, pollIntervalMs, onResult })
```

它内部仍然保持当前单任务执行逻辑。`concurrency: 1` 时，如果已有 attestation 正在执行，新的 `startAttestation` 调用继续按旧逻辑返回 `ZkAttestationError('00003')`，不引入排队。

### ProcessAlgorithmPool

`ProcessAlgorithmPool` 管理多个子进程。每个子进程内部运行一个 `LocalAlgorithmRunner`，并且一次只执行一个任务。worker 按需懒启动：`init` 只保存 backend 和 concurrency 配置，不提前 fork 所有 worker。

```text
ProcessAlgorithmPool
  pending queue
  workers[]
    worker.busy
    worker.process
    worker.currentTaskId
```

调度策略：

- 有空闲 worker 时，立即分配任务。
- 没有空闲 worker 且当前 worker 数小于 `concurrency` 时，启动一个新 worker，worker init 成功后执行该任务。
- 没有空闲 worker 且当前 worker 数已达到 `concurrency` 时，任务进入 FIFO 队列。
- 每个任务有唯一 `taskId`，父进程用它路由 progress、done、error。
- 子进程完成任务后标记为空闲，再从队列取下一个任务。
- 已启动 worker 空闲后保留复用，直到 `client.close()` 或进程退出清理。

## 父子进程协议

父进程到子进程：

```ts
type ParentToChildMessage =
  | {
      id: string;
      type: 'init';
      backend: AlgorithmBackend;
    }
  | {
      id: string;
      type: 'attest';
      params: unknown;
      timeout: number;
      pollIntervalMs: number;
    }
  | {
      id: string;
      type: 'close';
    };
```

子进程到父进程：

```ts
type ChildToParentMessage =
  | {
      id: string;
      type: 'ready';
      result: unknown;
    }
  | {
      id: string;
      type: 'progress';
      result: unknown;
    }
  | {
      id: string;
      type: 'done';
      result: unknown;
    }
  | {
      id: string;
      type: 'error';
      error: SerializedError;
    };
```

子进程只负责执行算法和回传原始结果，不负责业务错误映射。父进程所在的 `PrimusCoreTLS` 继续负责把算法结果映射成 SDK 对外错误码、event report、`privateData` 存储和最终 `Attestation` 解析。

## Algorithm Result 协议

最终证明：

```json
{
  "retcode": "0",
  "content": {
    "balanceGreaterThanBaseValue": "true",
    "signature": "...",
    "encodedData": "...",
    "privateData": "..."
  }
}
```

失败：

```json
{
  "retcode": "2",
  "details": {
    "errlog": {
      "code": "...",
      "desc": "..."
    }
  }
}
```

中间 stream 结果：

```json
{
  "retcode": "1",
  "status": "streaming",
  "requestid": "...",
  "content": {
    "sequence": 1,
    "data": {}
  }
}
```

这里先假设算法层用 `retcode: '1'` 和 `status: 'streaming'` 表示中间结果。如果 native/WASM 算法实际使用其他标记，SDK 应在内部归一化为 `stream-data` 事件，避免把算法层状态名暴露给开发者。

## getAttestationResult 调整

当前 `getAttestationResult(timeout)` 保留兼容。

新增 options 形式：

```ts
type GetAttestationResultOptions = {
  timeout?: number;
  pollIntervalMs?: number;
  onResult?: (result: unknown) => void | Promise<void>;
};

getAttestationResult(timeout?: number): Promise<unknown>;
getAttestationResult(options?: GetAttestationResultOptions): Promise<unknown>;
```

轮询行为：

- 每次调用算法 `getAttestationResult` 得到有效中间结果时，触发 `onResult(result)`。
- 如果结果是最终成功 `retcode === '0'`，resolve。
- 如果结果是失败 `retcode === '2'`，resolve 失败结果给上层，由 `startAttestation` 沿用现有错误映射逻辑处理。
- 如果超时，reject `{ code: 'timeout', data: lastResult }`。
- `pollIntervalMs` 默认 `500`。

注意：即使多进程并发存在，单个子进程内的 `getAttestationResult` 仍然查询该子进程当前唯一进行中的任务，不要求算法支持 request id 路由。

任务 `timeout` 从任务分配到已初始化 worker 并开始执行算法 attestation 后计算，不包含排队时间，也不包含懒启动 worker 的 fork/init 时间。这样可以避免第一次请求因为进程启动成本被错误计入 attestation 超时。

## startAttestation 数据流

1. `startAttestation` 解析参数，兼容旧 positional 形式和新 options 形式。
2. SDK 解析并校验 signed attestation request。
3. SDK 校验 `timeout`、`algoUrls`、`pollIntervalMs` 等参数。
4. `assemblyParams` 生成 `attParams.requestid`。
5. 如果调用方传入的是 `AttRequest` 实例，SDK 继续写入 `input.requestid = attParams.requestid`。
6. SDK 选择当前 runner：
   - `concurrency <= 1`：本进程 runner，沿用 `_isAttesting` 并发拒绝逻辑。
   - `concurrency > 1`：进程池 runner，worker 按需懒启动，超过并发度的任务排队。
7. SDK 调用 `runner.runAttestation(attParams, { timeout, pollIntervalMs, onResult })`。在进程池模式下，如果需要新 worker，runner 先 fork 并 init worker，再开始计算该任务的 attestation timeout。
8. 本进程或子进程调用 `getAttestation(attParams)` 启动算法。
9. 本进程或子进程调用 `getAttestationResult({ timeout, pollIntervalMs, onResult })` 轮询。
10. 如果拿到中间 stream 结果，runner 通过 `onResult` 或子进程 `progress` 消息交给 `startAttestation`。
11. 如果 `stream === true` 且存在 `onProgress`，SDK 把中间结果归一化为 `AttestationProgressEvent` 并触发回调。
12. 如果拿到最终证明，SDK 触发 `proof-ready` 回调，保存 `privateData`，上报成功事件，然后 resolve 解析后的 `Attestation`。
13. 如果拿到失败结果或发生超时，SDK 触发 `error` 回调，上报失败事件，然后沿用现有错误映射 reject。

## Progress 路由

并发场景下，progress 不能用全局回调。每个 `startAttestation` 调用都必须有自己的闭包状态：

```text
startAttestation(req1)
  taskId = a
  requestId = req1RequestId
  onProgress = handleReq1Progress

startAttestation(req2)
  taskId = b
  requestId = req2RequestId
  onProgress = handleReq2Progress
```

父进程收到子进程消息：

```json
{ "id": "a", "type": "progress", "result": { "retcode": "1" } }
```

只触发 task `a` 对应的 `handleReq1Progress`，不能广播给所有 attestation。

## 错误处理

### Attestation 错误

attestation 自身错误沿用当前行为：

- `getAttestation` 启动失败继续映射到现有启动错误。
- 最终 `retcode === '2'` 继续走现有 algorithm error mapping。
- 超时继续映射到 `ZkAttestationError('00002')`。
- event report 逻辑保持现有成功、失败上报规则。

### Progress 回调错误

中间结果回调错误是开发者业务代码错误，不是 zkTLS 证明错误。默认策略：

- `abortOnProgressError: false`：SDK catch 回调异常，继续轮询和证明生成。
- `abortOnProgressError: true`：SDK reject 当前 `startAttestation`，错误为回调抛出的 error。

如果 `abortOnProgressError: true` 发生在进程池任务中，父进程应停止等待该任务后续结果，并向子进程发送取消或重启 worker。由于算法层未必支持取消，推荐最小实现是重启该子进程，保证该 worker 后续状态干净。

### 子进程错误

如果子进程异常退出：

- 当前 worker 上正在执行的任务 reject。
- reject error 应包含子进程退出码、signal 和 task id。
- pool 移除该 worker，并尝试拉起替代 worker。
- 已排队但未分配到该 worker 的任务不受影响。

如果懒启动 worker init 失败：

- 当前等待该 worker 的任务 reject。
- 该 worker 从 pool 移除。
- 已经在其他 worker 上运行的任务不受影响。
- 已排队且尚未分配的任务保留在队列中，后续任务调度可再次尝试启动新 worker。

## 取消和资源释放

本设计不新增公开 cancel API。

内部需要支持：

- `ProcessAlgorithmPool.close()`：关闭所有子进程。
- `PrimusCoreTLS.close()`：关闭所有已启动 worker，释放 SDK 内部进程资源。
- 当 `abortOnProgressError: true` 或子进程协议异常时，可以重启对应 worker 来恢复干净状态。

进程池还应保证 Node 进程退出时不会因为 orphan child process 阻塞退出。实现时可考虑在 `process.on('exit')` 中清理子进程。

## 兼容性规则

- `startAttestation(input)` 行为不变。
- `startAttestation(input, timeout)` 行为不变。
- `startAttestation(input, timeout, algoUrls)` 行为不变。
- `startAttestation(input, { timeout, algoUrls })` 与旧 positional 参数等价。
- `init(appId, appSecret)` 行为不变。
- `init(appId, appSecret, 'native')` 行为不变。
- `init(appId, appSecret, { backend: 'native' })` 与旧 backend 参数等价。
- 只有 `stream === true` 且传入 `onProgress` 时，SDK 才触发中间结果回调。
- `concurrency` 未设置时不启用多进程。
- `concurrency: 1` 时，保持当前 SDK 行为：同一实例并发调用 `startAttestation` 继续返回 `00003`，不排队。
- `concurrency > 1` 时，多个 `startAttestation` 可以同时执行；worker 按需懒启动，超过并发度的任务进入队列。
- 现有错误码、最终证明解析逻辑、`privateData` 存储逻辑保持不变。

## 需要修改的模块

### `src/index.d.ts`

- 增加 `PrimusInitOptions`。
- 增加 `StartAttestationOptions`。
- 增加 `AttestationProgressEvent`。
- 更新 `startAttestation`、`init` 和 `close` 类型声明。

### `src/primus_zk.ts`

- 保留当前 `init(mode)`、`getAttestation(paramsObj)`、`getAttestationResult(timeout)` 兼容接口。
- 增加 `getAttestationResult(options)`。
- 让 polling 支持 `pollIntervalMs` 和 `onResult`。
- 记录 `lastResult`，超时时返回给上层。

### `src/index.ts`

- `init` 支持 `AlgorithmBackend | PrimusInitOptions`。
- 增加 `close()`，用于关闭进程池中已启动的子进程。
- `startAttestation` 支持旧参数和 options 参数解析。
- `concurrency: 1` 时保留实例级 `_isAttesting` 并发拒绝逻辑。
- `concurrency > 1` 时使用进程池并发，超过并发度的任务由 pool 排队。
- 增加 progress result 归一化和 `onProgress` 调用。
- 保留现有错误映射、event report、`privateData` 存储逻辑。

### 新增 runner 模块

建议新增：

```text
src/algorithm/AlgorithmRunner.ts
src/algorithm/LocalAlgorithmRunner.ts
src/algorithm/ProcessAlgorithmPool.ts
src/algorithm/process_worker.ts
```

职责：

- `AlgorithmRunner.ts`：定义接口和协议类型。
- `LocalAlgorithmRunner.ts`：包装当前本进程算法调用。
- `ProcessAlgorithmPool.ts`：父进程池、懒启动、队列、任务路由、worker 重启。
- `process_worker.ts`：子进程入口，加载算法并处理 `init` / `attest` 消息。

## 测试计划

### 兼容性测试

- 保留并通过现有 `startAttestation(input, timeout, algoUrls)` 测试。
- 新增 `startAttestation(input, { timeout, algoUrls })` 测试，确认 options 签名与旧签名等价。
- 新增 `init(appId, secret, 'native')` 和 `init(appId, secret, { backend: 'native' })` 等价测试。

### Stream 测试

- mock `getAttestationResult` 先返回多个中间结果，再返回最终证明，断言 `onProgress` 按顺序收到 `stream-data` 和 `proof-ready`。
- `stream: false` 时，即使算法返回中间结果，也不触发 `onProgress`。
- 未传 `onProgress` 时，不触发回调且最终证明正常返回。
- `abortOnProgressError: false` 时，`onProgress` 抛错但最终证明仍能 resolve。
- `abortOnProgressError: true` 时，`onProgress` 抛错导致当前 `startAttestation` reject。
- 超时前存在中间结果时，timeout error data 包含最后一次 result。

### 并发和进程池测试

- `concurrency: 1` 时，两个 `startAttestation` 并发提交，第二个继续返回 `ZkAttestationError('00003')`。
- `concurrency: 2` 时，三个任务同时提交，前两个触发懒启动 worker 并执行，第三个排队。
- `concurrency: 2` 但只提交一个任务时，只启动一个 worker，不预启动第二个 worker。
- 两个并发 stream 任务的 progress 分别路由到各自 `onProgress`，不能串线。
- 一个任务失败不影响另一个 worker 上的任务。
- 子进程异常退出时，当前任务 reject，pool 拉起替代 worker。
- 懒启动 worker init 失败时，当前任务 reject，其他 worker 和已排队任务不受影响。
- `client.close()` 关闭所有已启动 worker。

### 类型测试

- `startAttestation(input, 1000)` 类型通过。
- `startAttestation(input, 1000, algoUrls)` 类型通过。
- `startAttestation(input, { timeout: 1000, stream: true, onProgress })` 类型通过。
- `init(appId, secret, 'wasm')` 类型通过。
- `init(appId, secret, { backend: 'wasm', concurrency: 2 })` 类型通过。

## 待确认实现细节

- 算法层中间结果的真实返回格式需要确认。本文暂定为 `retcode: '1'` 和 `status: 'streaming'`。
- 算法层是否支持取消当前任务需要确认。若不支持，`abortOnProgressError: true` 时推荐重启对应子进程。
- native addon 在同一进程多次加载是否隔离不可靠，因此真正并发必须优先使用 child process，而不是 `worker_threads`。
- 浏览器环境是否需要并发支持需要单独设计。本文的多进程方案只覆盖 Node.js SDK。
