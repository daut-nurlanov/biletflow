export const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
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
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(BASE + path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  // expired or invalid token: sign the user out
  if (res.status === 401 && token) {
    setToken(null)
    window.dispatchEvent(new Event('biletflow:logout'))
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      // body is not JSON, keep statusText
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}