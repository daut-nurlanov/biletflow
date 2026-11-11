import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from './api'
import type { User } from './types'

interface AuthValue {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  // при открытии сайта: если токен сохранён, узнаём, кто это
  useEffect(() => {
    if (getToken()) {
      api<User>('/api/auth/me').then(setUser).catch(() => setUser(null))
    }
    const onLogout = () => setUser(null)
    window.addEventListener('biletflow:logout', onLogout)
    return () => window.removeEventListener('biletflow:logout', onLogout)
  }, [])

  async function login(email: string, password: string) {
    // ответ: данные пользователя + token (форму можно проверить в /docs)
    const data = await api<{ token: string; user?: User } & Partial<User>>(
      '/api/auth/login',
      { method: 'POST', body: { email, password } },
    )
    setToken(data.token)
    setUser((data.user ?? data) as User)
  }

  function logout() {
    setToken(null)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth нужно использовать внутри AuthProvider')
  return ctx
}