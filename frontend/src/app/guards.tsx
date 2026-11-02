import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { homePathFor, useAuth } from '@/lib/auth'
import type { Role } from '@/lib/types'

export function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <LoaderCircle className="size-8 animate-spin text-muted-foreground" aria-label="Đang tải" />
    </div>
  )
}

/** Chưa đăng nhập -> về /login (nhớ trang đang mở để quay lại); sai role -> về trang chủ của role. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'guest') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (roles && !roles.includes(state.user.role)) return <Navigate to={homePathFor(state.user.role)} replace />
  return children
}

export function HomeRedirect() {
  const { state } = useAuth()
  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'guest') return <Navigate to="/login" replace />
  return <Navigate to={homePathFor(state.user.role)} replace />
}
