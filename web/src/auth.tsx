import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from './api'
import type { User } from './types'

interface AuthValue {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (fullName: string, email: string, password: string) => Promise<void>
  logout: () => void
}

type AuthResponse = { token: string; user?: User } & Partial<User>

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  // on page load: if a token is saved, find out who it belongs to
  useEffect(() => {
    if (getToken()) {
      api<User>('/api/auth/me').then(setUser).catch(() => setUser(null))
    }
    const onLogout = () => setUser(null)
    window.addEventListener('biletflow:logout', onLogout)
    return () => window.removeEventListener('biletflow:logout', onLogout)
  }, [])

  function applyAuth(data: AuthResponse) {
    setToken(data.token)
    setUser((data.user ?? data) as User)
  }

  async function login(email: string, password: string) {
    applyAuth(await api<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password } }))
  }

  async function register(fullName: string, email: string, password: string) {
    applyAuth(
      await api<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: { email, password, full_name: fullName, role: 'attendee' },
      }),
    )
  }

  function logout() {
    setToken(null)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}