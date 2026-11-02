import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from './api'
import type { Role, TokenOut, User } from './types'

type AuthState = { status: 'loading' } | { status: 'guest' } | { status: 'authed'; user: User }

interface AuthContextValue {
  state: AuthState
  user: User | null
  login: (username: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const queryClient = useQueryClient()

  useEffect(() => {
    setSessionExpiredHandler(() => {
      queryClient.clear()
      setState({ status: 'guest' })
    })
    // Mở lại trang: thử khôi phục phiên đăng nhập bằng cookie refresh token
    refreshSession().then((data) => setState(data ? { status: 'authed', user: data.user } : { status: 'guest' }))
  }, [queryClient])

  const login = useCallback(async (username: string, password: string) => {
    const data = await api<TokenOut>('/auth/login', { method: 'POST', json: { username, password } })
    setAccessToken(data.access_token)
    setState({ status: 'authed', user: data.user })
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      setAccessToken(null)
      queryClient.clear()
      setState({ status: 'guest' })
    }
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({ state, user: state.status === 'authed' ? state.user : null, login, logout }),
    [state, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider')
  return ctx
}

export function homePathFor(role: Role) {
  return role === 'student' ? '/cua-toi' : role === 'admin' ? '/dashboard' : '/lop'
}
