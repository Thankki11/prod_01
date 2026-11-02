import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'

import { AppLayout } from './AppLayout'
import { FullPageSpinner, HomeRedirect, RequireAuth } from './guards'
import { CheckInPage } from '@/features/attendance/CheckInPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { LoadingRows } from '@/components/QueryState'
import type { Role } from '@/lib/types'

// Đăng nhập + điểm danh tải ngay (sinh viên quét QR bằng 4G cần nhanh).
// Các trang quản trị tách file riêng, chỉ tải khi mở tới — Recharts nặng nằm ở đây.
function lazyNamed<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}
const DashboardPage = lazyNamed(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage')
const ClassesPage = lazyNamed(() => import('@/features/classes/ClassesPage'), 'ClassesPage')
const ClassDetailPage = lazyNamed(() => import('@/features/classes/ClassDetailPage'), 'ClassDetailPage')
const SessionPage = lazyNamed(() => import('@/features/sessions/SessionPage'), 'SessionPage')
const QrPresentPage = lazyNamed(() => import('@/features/sessions/QrPresentPage'), 'QrPresentPage')
const UsersPage = lazyNamed(() => import('@/features/users/UsersPage'), 'UsersPage')
const SubjectsPage = lazyNamed(() => import('@/features/subjects/SubjectsPage'), 'SubjectsPage')
const MyAttendancePage = lazyNamed(() => import('@/features/attendance/MyAttendancePage'), 'MyAttendancePage')

function page(Component: ComponentType, roles: Role[]) {
  return (
    <RequireAuth roles={roles}>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Component />
      </Suspense>
    </RequireAuth>
  )
}

const STAFF: Role[] = ['admin', 'lecturer']

// Thêm module mới: thêm route ở đây + mục menu trong AppLayout (NAV)
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <HomeRedirect /> },
  {
    // Trang sinh viên mở sau khi quét QR bằng camera điện thoại
    path: '/diem-danh',
    element: (
      <RequireAuth roles={['student']}>
        <CheckInPage />
      </RequireAuth>
    ),
  },
  {
    // Màn hình chiếu QR: toàn màn hình, không có menu
    path: '/buoi/:sessionId/qr',
    element: (
      <RequireAuth roles={STAFF}>
        <Suspense fallback={<FullPageSpinner />}>
          <QrPresentPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/dashboard', element: page(DashboardPage, STAFF) },
      { path: '/lop', element: page(ClassesPage, STAFF) },
      { path: '/lop/:classId', element: page(ClassDetailPage, STAFF) },
      { path: '/buoi/:sessionId', element: page(SessionPage, STAFF) },
      { path: '/nguoi-dung', element: page(UsersPage, ['admin']) },
      { path: '/mon-hoc', element: page(SubjectsPage, ['admin']) },
      { path: '/cua-toi', element: page(MyAttendancePage, ['student']) },
    ],
  },
  { path: '*', element: <HomeRedirect /> },
])
