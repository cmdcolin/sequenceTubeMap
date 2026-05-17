/**
 * Simulates a Web Worker in-process for Vitest. Cross-connects two
 * EventEmitters so Comlink's postMessage/addEventListener API works on both sides.
 */

import { setUpWorker } from '../WorkerImplementation.ts'

import { EventEmitter } from 'events'

export function makeWorker() {
  // Make a couple EventEmmitters, chrome them up to look more browser-y, and
  // cross-connect their message events and postMessage functions.
  const workerSide = new EventEmitter()
  workerSide.addEventListener = workerSide.on

  const userSide = new EventEmitter()
  userSide.addEventListener = userSide.on

  workerSide.postMessage = (message, _options) => {
    setTimeout(() => {
      userSide.emit('message', { data: message })
    })
  }

  userSide.postMessage = (message, _options) => {
    setTimeout(() => {
      workerSide.emit('message', { data: message })
    })
  }

  setUpWorker(workerSide)

  // Hide the one side in the other.
  userSide.actualWorker = workerSide

  return userSide
}
