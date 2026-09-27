function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

// Proxies and frameworks answer errors with a whole HTML page; the alert only
// needs its text.
function htmlToText(text: string): string {
  if (!/^\s*<(!doctype|html)/i.test(text)) {
    return text
  }
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(text)?.[1] ?? text
  return body
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Fetch a JSON response and throw if the server returns an error code, the
// response is not valid JSON, or the response body contains an "error" field.
//
// The body is read as text first so an error status is reported even when the
// response isn't JSON at all — a proxy's HTML 502 page used to surface as an
// opaque "Unexpected token '<'" from response.json().
export async function fetchAndParse<T = unknown>(
  ...fetchArgs: Parameters<typeof fetch>
): Promise<T> {
  const response = await fetch(...fetchArgs)
  const text = await response.text()
  const json = parseJson(text)
  const error = json?.error
  if (!response.ok) {
    throw new Error(
      `Server responded with error code ${response.status}: ${error === undefined ? htmlToText(text) : String(error)}`,
    )
  }
  if (error) {
    // Even 200 responses can come with error messages.
    throw new Error(String(error))
  }
  if (json === undefined) {
    throw new Error(`Server response was not JSON: ${text}`)
  }
  return json as T
}
