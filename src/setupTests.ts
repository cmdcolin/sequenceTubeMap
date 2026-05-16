import { TextEncoder, TextDecoder } from 'util'
import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.stubGlobal('TextEncoder', TextEncoder)
vi.stubGlobal('TextDecoder', TextDecoder)

// jsdom's WebSocket and undici's native Event class are incompatible in
// Node.js 22+, causing uncaught exceptions. Since WebSocket is only used for
// file-change notifications (not needed in tests), we stub it out.
class MockWebSocket {
  close() {}
  send() {}
  set onmessage(_v: unknown) {}
  set onclose(_v: unknown) {}
  set onerror(_v: unknown) {}
  set onopen(_v: unknown) {}
  addEventListener() {}
  removeEventListener() {}
}
vi.stubGlobal('WebSocket', MockWebSocket)

vi.mock('./api/local/WorkerFactory')
