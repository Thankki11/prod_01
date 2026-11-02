import { useMutation } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Clock, LoaderCircle, RefreshCw, ScanLine, UserX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { cn } from 'cn'

import { buttonVariants } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtTime, STATUS_LABEL } from '@/lib/format'
import type { CheckInResult } from '@/lib/types'

const ERROR_VIEW: Record<string, { icon: typeof CircleAlert; title: string; hint: string; tone: string }> = {
  expired: { icon: RefreshCw, title: 'Mã QR đã hết hạn', hint: 'Mã đổi mỗi 15 giây. Hãy quét lại mã đang hiện trên màn hình lớp.', tone: 'text-late' },
  duplicate: { icon: CircleCheck, title: 'Bạn đã điểm danh rồi', hint: 'Buổi học này đã ghi nhận bạn, không cần quét lại.', tone: 'text-present' },
  not_enrolled: { icon: UserX, title: 'Bạn không có tên trong lớp', hint: 'Liên hệ giảng viên nếu bạn nghĩ đây là nhầm lẫn.', tone: 'text-absent' },
  not_open: { icon: Clock, title: 'Buổi học không còn nhận điểm danh', hint: 'Giảng viên chưa mở hoặc đã đóng điểm danh.', tone: 'text-late' },
  invalid: { icon: CircleAlert, title: 'Mã QR không hợp lệ', hint: 'Hãy quét đúng mã QR do giảng viên chiếu trên màn hình.', tone: 'text-absent' },
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col bg-background px-4 py-6">
      <p className="text-center text-sm text-muted-foreground">
        {user?.full_name} {user?.student_code && `· ${user.student_code}`}
      </p>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 text-center">{children}</main>
      <Link to="/cua-toi" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mx-auto w-full max-w-sm')}>
        Xem lịch sử điểm danh
      </Link>
    </div>
  )
}

export function CheckInPage() {
  const [params, setParams] = useSearchParams()
  // Giữ mã của lần mở trang đầu tiên; URL sẽ bị xoá mã ngay sau đó
  const [token] = useState(() => params.get('t'))
  const sent = useRef(false)
  const mutation = useMutation({
    mutationFn: (t: string) => api<CheckInResult>('/attendance/check-in', { method: 'POST', json: { token: t } }),
  })

  useEffect(() => {
    // StrictMode gọi effect 2 lần ở dev: chỉ gửi 1 lần
    if (!token || sent.current) return
    sent.current = true
    mutation.mutate(token)
    // Bỏ mã khỏi thanh địa chỉ để không lỡ chia sẻ/tải lại đường dẫn có mã
    setParams({}, { replace: true })
  }, [token, mutation, setParams])

  if (!token) {
    return (
      <Shell>
        <ScanLine className="size-16 text-muted-foreground" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold">Quét mã QR để điểm danh</h1>
          <p className="mt-2 text-muted-foreground">Mở camera điện thoại và hướng vào mã QR giảng viên chiếu trên màn hình lớp.</p>
        </div>
      </Shell>
    )
  }

  if (mutation.isPending || mutation.isIdle) {
    return (
      <Shell>
        <LoaderCircle className="size-14 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-lg" role="status">
          Đang điểm danh…
        </p>
      </Shell>
    )
  }

  if (mutation.isError) {
    const reason = mutation.error instanceof ApiError ? mutation.error.reason : undefined
    const view = ERROR_VIEW[reason ?? ''] ?? {
      icon: CircleAlert,
      title: 'Không điểm danh được',
      hint: mutation.error.message,
      tone: 'text-absent',
    }
    const Icon = view.icon
    return (
      <Shell>
        <Icon className={cn('size-20', view.tone)} aria-hidden />
        <div role="alert">
          <h1 className="text-2xl font-semibold">{view.title}</h1>
          <p className="mt-2 text-muted-foreground">{view.hint}</p>
        </div>
      </Shell>
    )
  }

  const r = mutation.data
  const late = r.status === 'late'
  return (
    <Shell>
      <div className={cn('grid size-28 place-items-center rounded-full', late ? 'bg-late-soft' : 'bg-present-soft')}>
        {late ? <Clock className="size-16 text-late" aria-hidden /> : <CircleCheck className="size-16 text-present" aria-hidden />}
      </div>
      <div role="status">
        <h1 className="text-2xl font-semibold">Điểm danh thành công</h1>
        <p className={cn('mt-1 text-lg font-medium', late ? 'text-late' : 'text-present')}>{STATUS_LABEL[r.status]}</p>
      </div>
      <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border bg-card p-4 text-left text-sm">
        <dt className="text-muted-foreground">Lớp</dt>
        <dd className="font-medium">
          {r.class_name} <span className="text-muted-foreground">({r.class_code})</span>
        </dd>
        <dt className="text-muted-foreground">Buổi</dt>
        <dd className="font-medium">{r.session_title}</dd>
        <dt className="text-muted-foreground">Lúc</dt>
        <dd className="tabular font-medium">{fmtTime(r.checked_in_at)}</dd>
      </dl>
    </Shell>
  )
}
