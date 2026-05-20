// Fetch a JSON response and throw if the server returns an error code, the
// response is not valid JSON, or the response body contains an "error" field.
export async function fetchAndParse<T = unknown>(
  ...fetchArgs: Parameters<typeof fetch>
): Promise<T> {
  const response = await fetch(...fetchArgs)
  const json = await response.json() as Record<string, unknown>
  if (json['error']) {
    // Even 200 responses can come with error messages.
    throw new Error(String(json['error']))
  }
  if (response.status < 200 || response.status > 299) {
    throw new Error('Server responded with error code ' + response.status)
  }
  return json as T
}
