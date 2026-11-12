import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { api, getToken, setToken } from './api'
import type { User } from './types'

interface AuthValue {
  user: User | null
  loading: boolean
  error: string
  login: (email: string, password: string) => Promise<User>
  register: (fullName: string, email: string, password: string) => Promise<User>
  logout: () => void
}

type AuthResponse = { token: string; user?: User } & Partial<User>

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => Boolean(getToken()))
  const [error, setError] = useState('')

  // on page load: if a token is saved, find out who it belongs to
  useEffect(() => {
    let active = true
    const token = getToken()
    if (token) {
      api<User>('/api/auth/me')
        .then((data) => {
          if (active && getToken() === token) setUser(data)
        })
        .catch((err: unknown) => {
          if (active && getToken() === token) {
            setError(
              err instanceof Error ? err.message : 'Could not verify your sign-in',
            )
          }
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }
    const onLogout = () => {
      setUser(null)
      setError('')
      setLoading(false)
    }
    window.addEventListener('biletflow:logout', onLogout)
    return () => {
      active = false
      window.removeEventListener('biletflow:logout', onLogout)
    }
  }, [])

  function applyAuth(data: AuthResponse): User {
    setToken(data.token)
    const signedInUser = (data.user ?? data) as User
    setUser(signedInUser)
    setError('')
    setLoading(false)
    return signedInUser
  }

  async function login(email: string, password: string) {
    return applyAuth(
      await api<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      }),
    )
  }

  async function register(fullName: string, email: string, password: string) {
    return applyAuth(
      await api<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: { email, password, full_name: fullName, role: 'attendee' },
      }),
    )
  }

  function logout() {
    setToken(null)
    setUser(null)
    setError('')
    setLoading(false)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, error, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}