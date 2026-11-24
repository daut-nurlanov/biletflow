export const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY = 'biletflow_token'

// Pictures uploaded to BiletFlow are stored as paths like /api/events/<id>/image.
// The website and the API run on different addresses, so add the API address.
export const imageSrc = (url: string | null | undefined) =>
  !url ? '' : url.startsWith('/') ? `${BASE}${url}` : url

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiResponse(
  path: string,
  options: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    signal?: AbortSignal
  } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const timeout = AbortSignal.timeout(20_000)
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error(
      timeout.aborted
        ? 'The server did not respond in time. Refresh the data before trying again.'
        : 'Could not reach the server. Check your connection and make sure the API is running.',
      { cause: error },
    )
  }

  // expired or invalid token: sign the user out
  if (res.status === 401 && token && getToken() === token) {
    setToken(null)
    window.dispatchEvent(new Event('biletflow:logout'))
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') detail = data.detail
      else if (Array.isArray(data.detail)) {
        detail = data.detail
          .map((item: { msg?: string }) => item.msg ?? 'Invalid value')
          .join('. ')
      }
    } catch {
      // body is not JSON, keep statusText
    }
    throw new ApiError(res.status, detail)
  }
  return res
}

export async function api<T>(
  path: string,
  options: Parameters<typeof apiResponse>[1] = {},
): Promise<T> {
  const response = await apiResponse(path, options)
  return response.json() as Promise<T>
}
