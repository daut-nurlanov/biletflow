const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY = 'biletflow_token'

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

export async function api<T>(
  path: string,
  options: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    signal?: AbortSignal
  } = {},
): Promise<T> {
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
        ? 'The server took too long to respond. Refresh the data before trying again.'
        : 'Could not reach the server. Check your connection and make sure the API is running.',
      { cause: error },
    )
  }

  //clear only the session that produced this unauthorized response
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
      //keep statusText when the response is not JSON
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}
