import { TextEncoder, TextDecoder } from "util";
import '@testing-library/jest-dom'
import { vi } from 'vitest'

globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

// jsdom's WebSocket and undici's native Event class are incompatible in
// Node.js 22+, causing uncaught exceptions. Since WebSocket is only used for
// file-change notifications (not needed in tests), we stub it out.
globalThis.WebSocket = class MockWebSocket {
  constructor() {}
  close() {}
  send() {}
  set onmessage(_v) {}
  set onclose(_v) {}
  set onerror(_v) {}
  set onopen(_v) {}
  addEventListener() {}
  removeEventListener() {}
};

vi.mock("./api/local/WorkerFactory")
