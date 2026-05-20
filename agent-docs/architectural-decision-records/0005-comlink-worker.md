# 0005 — Comlink for main↔worker IPC

Status: Accepted

## Context

`LocalAPI` delegates to `GBZBaseAPI` inside a Web Worker so WASM execution
doesn't block the main thread. The original worker-rpc library was replaced
with Comlink.

## Decision

Comlink wraps the worker as a proxied class. Every method on `WorkerAPI` is
callable as if it were async on the main thread. Callbacks crossing the
boundary (e.g. filename-change notifications) use `Comlink.proxy`.

## Consequences

- Adding a method = add it to `WorkerAPI` in `WorkerImplementation.ts`; the
  proxy type flows through automatically.
- Anything passed in or returned must be structured-cloneable (or wrapped in
  `Comlink.proxy`). No closures over main-thread state.
- Worker startup is lazy (first proxy call); cancellation goes through
  `AbortSignal` → numeric `cancelID` because signals don't cross the bridge.
