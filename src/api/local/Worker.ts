/**
 * Web Worker entry point for the local API implementation.
 *
 * Doesn't do work itself — it just wires the WorkerAPI to the worker's
 * DedicatedWorkerGlobalScope. Under Vitest, this entry point is bypassed by
 * the WorkerFactory mock, which constructs the API around a pair of
 * EventEmitters instead.
 */

import type * as Comlink from 'comlink'
import { setUpWorker } from './WorkerImplementation.ts'

setUpWorker(self as unknown as Comlink.Endpoint)
