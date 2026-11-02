import { BookOpen, ClipboardCheck, LayoutDashboard, LogOut, Menu, QrCode, School, Users } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { cn } from 'cn'

import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/format'
import type { Role } from '@/lib/types'

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; roles: Role[] }[] = [
  { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard, roles: ['admin', 'lecturer'] },
  { to: '/lop', label: 'Lớp học', icon: School, roles: ['admin', 'lecturer'] },
  { to: '/nguoi-dung', label: 'Người dùng', icon: Users, roles: ['admin'] },
  { to: '/mon-hoc', label: 'Môn học', icon: BookOpen, roles: ['admin'] },
  { to: '/cua-toi', label: 'Điểm danh của tôi', icon: ClipboardCheck, roles: ['student'] },
]

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
        <QrCode className="size-5" aria-hidden />
      </span>
      <span className="text-base font-semibold tracking-tight">Điểm Danh QR</span>
    </div>
  )
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  return (
    <nav aria-label="Điều hướng chính" className="grid gap-1">
      {NAV.filter((item) => user && item.roles.includes(user.role)).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors md:h-10',
              isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <Icon className="size-4.5" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function UserBox() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <div className="grid gap-2 border-t pt-4">
      <div className="px-2">
        <p className="truncate text-sm font-medium">{user.full_name}</p>
        <p className="text-xs text-muted-foreground">
          {ROLE_LABEL[user.role]}
          {user.student_code && ` · ${user.student_code}`}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <ChangePasswordDialog />
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={() => logout()} aria-label="Đăng xuất" title="Đăng xuất">
          <LogOut aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export function AppLayout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-card p-4 md:flex">
        <Brand />
        <div className="flex-1">
          <NavItems />
        </div>
        <UserBox />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/95 px-2 backdrop-blur md:hidden">
        <Brand />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Mở menu" />}>
            <Menu aria-hidden />
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col gap-6 p-4">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Brand />
            <div className="flex-1">
              <NavItems onNavigate={() => setOpen(false)} />
            </div>
            <UserBox />
          </SheetContent>
        </Sheet>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}
