import type { AttendanceStatus, Role, SessionStatus } from './types'

const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
const timeFmt = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dayMonthFmt = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' })

export const fmtDateTime = (iso: string | null) => (iso ? dateTimeFmt.format(new Date(iso)) : '—')
export const fmtTime = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : '—')
/** "2026-11-02" (ngày, không giờ) -> "02/11" — tạo Date theo giờ địa phương để không lệch ngày */
export const fmtDayMonth = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return dayMonthFmt.format(new Date(y, m - 1, d))
}
export const fmtPct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('vi-VN')}%`)

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Có mặt',
  late: 'Đi muộn',
  absent: 'Vắng',
}

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: 'Chưa mở',
  open: 'Đang điểm danh',
  closed: 'Đã kết thúc',
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Quản trị',
  lecturer: 'Giảng viên',
  student: 'Sinh viên',
}

/** Giá trị cho <input type="datetime-local"> theo giờ máy người dùng */
export function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function toYmd(date: Date) {
  return toLocalInputValue(date).slice(0, 10)
}
