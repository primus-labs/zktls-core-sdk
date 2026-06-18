# Stream and Concurrent Attestation for Developers

This document explains the developer-facing APIs for streaming attestation,
concurrent attestation, and backend-signed requests.

Runnable integration examples:

- `test/backendSignStream.integration.test.ts`
- `test/backendSignStream.concurrent.integration.test.ts`

## API Overview

### `init`

Use `init` to configure the SDK runtime.

```ts
await client.init(appId);
```

This uses the default backend selection and default concurrency of `1`.

For concurrent attestation, pass `concurrency` in the third argument:

```ts
await client.init(appId, undefined, {
  concurrency: 2,
});
```

`backend` is optional. If omitted, the SDK uses the default `auto` backend.

```ts
await client.init(appId, undefined, {
  backend: 'auto',
  concurrency: 2,
});
```

When `concurrency` is `1`, the SDK keeps the existing single-attestation
behavior. When `concurrency` is greater than `1`, the SDK can run multiple
attestations at the same time.

### `startAttestation`

Use `startAttestation` to start one attestation request.

The input can be either:

- an `AttRequest`
- a backend-signed request string

For stream mode, pass options with `stream: true` and `onProgress`.

```ts
// Adjust these values for the target API size and network conditions.
const ATTESTATION_TIMEOUT_MS = 20 * 60 * 1000;
const OFFLINE_TIMEOUT_MS = 10 * 60 * 1000;

const attestation = await client.startAttestation(signedRequestStr, {
  timeout: ATTESTATION_TIMEOUT_MS,
  stream: true,
  proveLargeData: true,
  offlineTimeout: OFFLINE_TIMEOUT_MS,
  onProgress: (event) => {
    if (event.type === 'stream-data') {
      console.log(event.requestId, event.sequence, event.data);
    }
  },
});
```

The returned value is still the final attestation proof. Stream data is delivered
through `onProgress` before the final proof resolves.

Key options:

- `timeout`: overall attestation timeout. The examples use 20 minutes; adjust it
  for the target API size and network conditions.
- `proveLargeData`: enables proving large response data. Use `true` when the
  request and response body can be large.
- `offlineTimeout`: plaintext request timeout. The examples use 10 minutes;
  adjust it for the target API and expected response latency.

## Progress Events

`onProgress` receives `AttestationProgressEvent`.

```ts
type AttestationProgressEvent =
  | {
      type: 'stream-data';
      requestId: string;
      sequence?: number;
      data: unknown;
    }
  | {
      type: 'proof-ready';
      requestId: string;
    }
  | {
      type: 'error';
      requestId: string;
      error: Error;
    };
```

Event meanings:

- `stream-data`: intermediate stream data is available.
- `proof-ready`: the final proof is ready and `startAttestation` is about to resolve.
- `error`: the attestation failed and `startAttestation` is about to reject.

`requestId` identifies the attestation that produced the event. In concurrent
usage, keep one callback per request or route events by `requestId`.

## Backend-Signed Stream Attestation

Backend signing keeps `appSecret` on your backend. The frontend or client creates
the attestation request, sends it to your backend, receives a signed request
string, and starts attestation with that string.

Backend signing flow:

```ts
// Client side: create request params without appSecret.
const client = new PrimusCoreTLS();
await client.init(appId);

const attRequest = client.generateRequestParams(request, responseResolves);
attRequest.setAttMode({
  algorithmType: 'proxytls',
  resultType: 'plain',
});

const signedRequestStr = await getBackendSignedRequest(attRequest);

const attestation = await client.startAttestation(signedRequestStr, {
  // Adjust these values for the target API size and network conditions.
  timeout: 20 * 60 * 1000,
  stream: true,
  proveLargeData: true,
  offlineTimeout: 10 * 60 * 1000,
  onProgress: (event) => {
    if (event.type === 'stream-data') {
      console.log('stream data:', event.data);
    }
  },
});
```

Backend signing endpoint:

```ts
const signer = new PrimusCoreTLS();
await signer.init(appId, appSecret);

const signParams = await readRequestBody(req);
const signResult = await signer.sign(signParams);

res.end(JSON.stringify({
  rc: 0,
  result: {
    signResult,
  },
}));
```

See `test/backendSignStream.integration.test.ts` for the complete single-request
integration test.

## Concurrent Stream Attestation

For concurrent stream attestations, initialize the SDK with `concurrency > 1`
and start multiple attestations with `Promise.all`.

```ts
const client = new PrimusCoreTLS();
await client.init(appId, undefined, {
  concurrency: 2,
});

const signedRequestStrs = await Promise.all(
  attRequests.map((attRequest) => getBackendSignedRequest(attRequest))
);

const eventsByRequest = signedRequestStrs.map(() => [] as AttestationProgressEvent[]);

const attestations = await Promise.all(
  signedRequestStrs.map((signedRequestStr, index) =>
    client.startAttestation(signedRequestStr, {
      // Adjust these values for the target API size and network conditions.
      timeout: 20 * 60 * 1000,
      stream: true,
      proveLargeData: true,
      offlineTimeout: 10 * 60 * 1000,
      onProgress: (event) => {
        eventsByRequest[index].push(event);
      },
    })
  )
);
```

Each `startAttestation` call receives its own `onProgress` callback. The
concurrent integration test also verifies that each callback receives events for
only one `requestId`, and that concurrent requests have distinct `requestId`
values.

See `test/backendSignStream.concurrent.integration.test.ts` for the complete
concurrent integration test.

## Resource Cleanup

Call `close` after using a client that may have initialized concurrent workers.

```ts
try {
  const attestation = await client.startAttestation(signedRequestStr, {
    stream: true,
    onProgress,
  });
} finally {
  await client.close();
}
```

## Running The Integration Tests


Required environment variables:

```sh
ZKTLS_APP_ID=...
ZKTLS_APP_SECRET=...
```

Run the tests:

```sh
npm test -- --runTestsByPath \
  test/backendSignStream.integration.test.ts \
  test/backendSignStream.concurrent.integration.test.ts
```

## Notes

- Do not expose `ZKTLS_APP_SECRET` in frontend code.
- Use backend signing when the client should not hold `appSecret`.
- Use `concurrency > 1` only when you need multiple attestations in flight.
- The main `startAttestation` promise resolves to the final proof even when
  `stream: true` is enabled.
