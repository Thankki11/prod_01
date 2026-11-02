import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ScanLine } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingRows } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { api } from '@/lib/api'
import { fmtDateTime } from '@/lib/format'
import type { MyAttendance } from '@/lib/types'

export function MyAttendancePage() {
  const data = useQuery({ queryKey: ['me', 'attendance'], queryFn: () => api<MyAttendance>('/me/attendance') })

  return (
    <>
      <PageHeader title="Điểm danh của tôi" />
      <Alert className="mb-6">
        <ScanLine aria-hidden />
        <AlertDescription>Để điểm danh: mở camera điện thoại và quét mã QR giảng viên chiếu trên màn hình lớp.</AlertDescription>
      </Alert>

      {data.isPending ? (
        <LoadingRows />
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : data.data.items.length === 0 ? (
        <EmptyState title="Chưa có lượt điểm danh nào" />
      ) : (
        <>
          <ul className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.summary.map((c) => {
              const total = c.present + c.late + c.absent
              const absentPct = total ? Math.round((c.absent / total) * 1000) / 10 : 0
              const over = absentPct > c.absence_threshold_pct
              return (
                <li key={c.class_id} className="rounded-xl border bg-card p-4">
                  <p className="tabular text-xs font-medium text-muted-foreground">{c.class_code}</p>
                  <p className="font-semibold">{c.class_name}</p>
                  <dl className="tabular mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <dt className="text-muted-foreground">Có mặt</dt>
                      <dd className="text-lg font-semibold text-present">{c.present}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Muộn</dt>
                      <dd className="text-lg font-semibold text-late">{c.late}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Vắng</dt>
                      <dd className="text-lg font-semibold text-absent">{c.absent}</dd>
                    </div>
                  </dl>
                  {over && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-absent">
                      <AlertTriangle className="size-4" aria-hidden />
                      Vắng {absentPct}% — vượt ngưỡng {c.absence_threshold_pct}%
                    </p>
                  )}
                </li>
              )
            })}
          </ul>

          <h2 className="mb-3 text-lg font-semibold">Lịch sử</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {data.data.items.map((i) => (
              <li key={i.session_id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.session_title}</p>
                  <p className="text-sm text-muted-foreground">
                    {i.class_code} · {fmtDateTime(i.starts_at)}
                  </p>
                </div>
                <StatusBadge status={i.status} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
