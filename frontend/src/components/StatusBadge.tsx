import { CircleCheck, CircleDashed, CircleX, Clock } from 'lucide-react'
import { cn } from 'cn'

import { STATUS_LABEL } from '@/lib/format'
import type { AttendanceStatus } from '@/lib/types'

const STYLE: Record<AttendanceStatus, { icon: typeof CircleCheck; className: string }> = {
  present: { icon: CircleCheck, className: 'bg-present-soft text-present' },
  late: { icon: Clock, className: 'bg-late-soft text-late' },
  absent: { icon: CircleX, className: 'bg-absent-soft text-absent' },
}

/** Trạng thái điểm danh: icon + chữ + màu (không chỉ dựa vào màu) */
export function StatusBadge({ status, className }: { status: AttendanceStatus | null; className?: string }) {
  if (status === null) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground', className)}>
        <CircleDashed className="size-3.5" aria-hidden />
        Chưa điểm danh
      </span>
    )
  }
  const { icon: Icon, className: tone } = STYLE[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', tone, className)}>
      <Icon className="size-3.5" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}
