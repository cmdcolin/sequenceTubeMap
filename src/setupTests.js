import { TextEncoder, TextDecoder } from "util";
import '@testing-library/jest-dom'
import { vi } from 'vitest'

globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

vi.mock("./api/local/WorkerFactory")
