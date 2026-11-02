// Kiểu dữ liệu khớp với schemas của backend (app/modules/*/schemas.py)

export type Role = 'admin' | 'lecturer' | 'student'
export type AttendanceStatus = 'present' | 'late' | 'absent'
export type AttendanceMethod = 'qr' | 'manual'
export type SessionStatus = 'scheduled' | 'open' | 'closed'

export interface User {
  id: number
  username: string
  student_code: string | null
  full_name: string
  role: Role
  is_active: boolean
  created_at: string
}

export interface TokenOut {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface Page<T> {
  items: T[]
  total: number
}

export interface Subject {
  id: number
  code: string
  name: string
}

export interface ClassItem {
  id: number
  code: string
  name: string
  semester: string
  late_after_minutes: number
  absence_threshold_pct: number
  subject: Subject
  lecturer: { id: number; full_name: string; username: string } | null
  student_count: number
}

export interface StudentInClass {
  id: number
  username: string
  student_code: string | null
  full_name: string
  is_active: boolean
  joined_at: string
}

export interface ImportResult {
  created: number
  enrolled: number
  already_enrolled: number
  errors: { line: number; message: string }[]
}

export interface SessionCounts {
  present: number
  late: number
  absent: number
  total_students: number
}

export interface ClassSession {
  id: number
  class_id: number
  title: string
  starts_at: string
  status: SessionStatus
  opened_at: string | null
  closed_at: string | null
  counts: SessionCounts
}

export interface QrInfo {
  token: string
  url: string
  expires_in: number
  rotate_seconds: number
  checked_in: number
  total_students: number
}

export interface AttendanceRow {
  record_id: number | null
  student_id: number
  student_code: string | null
  full_name: string
  status: AttendanceStatus | null
  method: AttendanceMethod | null
  checked_in_at: string | null
  note: string | null
}

export interface CheckInResult {
  status: AttendanceStatus
  checked_in_at: string
  session_title: string
  class_code: string
  class_name: string
}

export interface MyAttendance {
  summary: {
    class_id: number
    class_code: string
    class_name: string
    present: number
    late: number
    absent: number
    absence_threshold_pct: number
  }[]
  items: {
    session_id: number
    session_title: string
    starts_at: string
    class_id: number
    class_code: string
    class_name: string
    status: AttendanceStatus
    checked_in_at: string | null
  }[]
}

export interface DashboardSummary {
  today_rate: number | null
  today_expected: number
  today_attended: number
  open_sessions: number
  at_risk_students: number
  range_rate: number | null
  range_sessions: number
}

export interface WeekPoint {
  week_start: string
  present: number
  late: number
  absent: number
  rate: number | null
}

export interface AtRiskStudent {
  student_id: number
  student_code: string | null
  full_name: string
  class_id: number
  class_code: string
  absent: number
  sessions: number
  absence_pct: number
  threshold_pct: number
}
