import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarCheck, Radio, TrendingUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from 'cn'

import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingRows } from '@/components/QueryState'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { fmtDayMonth, fmtPct, toYmd } from '@/lib/format'
import type { AtRiskStudent, ClassItem, DashboardSummary, WeekPoint } from '@/lib/types'

function Kpi({ label, value, sub, icon: Icon, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon: typeof TrendingUp; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className={cn('size-5 text-muted-foreground', tone)} aria-hidden />
      </div>
      <p className={cn('tabular mt-2 text-3xl font-semibold tracking-tight', tone)}>{value}</p>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  )
}

function TrendChart({ data }: { data: WeekPoint[] }) {
  const hasData = data.some((w) => w.rate !== null)
  if (!hasData) return <EmptyState title="Chưa có dữ liệu điểm danh trong khoảng thời gian này" />
  const chartData = data.map((w) => ({ ...w, label: fmtDayMonth(w.week_start) }))
  return (
    <>
      <div className="h-72" role="img" aria-label="Biểu đồ tỉ lệ chuyên cần theo tuần. Số liệu chi tiết có trong bảng bên dưới.">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
            />
            <Tooltip
              formatter={(v) => [`${v}%`, 'Chuyên cần']}
              labelFormatter={(l) => `Tuần từ ${l}`}
              contentStyle={{ background: 'var(--color-popover)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-popover-foreground)' }}
            />
            <Line
              type="monotone"
              dataKey="rate"
              name="Chuyên cần"
              stroke="var(--color-chart-1)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--color-chart-1)' }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Xem bảng số liệu</summary>
        <div className="mt-2 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tuần từ</TableHead>
                <TableHead className="text-right">Có mặt</TableHead>
                <TableHead className="text-right">Đi muộn</TableHead>
                <TableHead className="text-right">Vắng</TableHead>
                <TableHead className="text-right">Chuyên cần</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chartData.map((w) => (
                <TableRow key={w.week_start}>
                  <TableCell>{w.label}</TableCell>
                  <TableCell className="tabular text-right">{w.present}</TableCell>
                  <TableCell className="tabular text-right">{w.late}</TableCell>
                  <TableCell className="tabular text-right">{w.absent}</TableCell>
                  <TableCell className="tabular text-right">{fmtPct(w.rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </>
  )
}

export function DashboardPage() {
  const [classId, setClassId] = useState('')
  const [from, setFrom] = useState(() => toYmd(new Date(Date.now() - 12 * 7 * 86400_000)))
  const [to, setTo] = useState(() => toYmd(new Date()))

  const params = new URLSearchParams({ from, to })
  if (classId) params.set('class_id', classId)
  const qs = params.toString()
  const validRange = from <= to

  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api<ClassItem[]>('/classes') })
  const summary = useQuery({
    queryKey: ['dashboard', 'summary', qs],
    queryFn: () => api<DashboardSummary>(`/dashboard/summary?${qs}`),
    enabled: validRange,
    refetchInterval: 30_000,
  })
  const trend = useQuery({ queryKey: ['dashboard', 'trend', qs], queryFn: () => api<WeekPoint[]>(`/dashboard/weekly-trend?${qs}`), enabled: validRange })
  const risk = useQuery({ queryKey: ['dashboard', 'risk', qs], queryFn: () => api<AtRiskStudent[]>(`/dashboard/at-risk-students?${qs}`), enabled: validRange })

  const s = summary.data
  return (
    <>
      <PageHeader title="Tổng quan" description="Theo dõi chuyên cần theo lớp và khoảng thời gian" />

      <div className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <FormField id="f-class" label="Lớp">
          <NativeSelect id="f-class" className="w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <NativeSelectOption value="">Tất cả lớp</NativeSelectOption>
            {classes.data?.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.code} · {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="f-from" label="Từ ngày" error={validRange ? undefined : 'Phải trước "Đến ngày"'}>
          <Input id="f-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField id="f-to" label="Đến ngày">
          <Input id="f-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </div>

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {!s ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32" />)
          ) : (
            <>
              <Kpi
                label="Chuyên cần hôm nay"
                value={fmtPct(s.today_rate)}
                sub={s.today_expected ? `${s.today_attended}/${s.today_expected} lượt có mặt` : 'Hôm nay chưa có buổi nào'}
                icon={CalendarCheck}
                tone="text-present"
              />
              <Kpi label="Buổi đang điểm danh" value={s.open_sessions} icon={Radio} />
              <Kpi
                label="Sinh viên vắng nhiều"
                value={s.at_risk_students}
                sub="Vượt ngưỡng vắng của lớp"
                icon={AlertTriangle}
                tone={s.at_risk_students ? 'text-absent' : undefined}
              />
              <Kpi label="Chuyên cần trong khoảng" value={fmtPct(s.range_rate)} sub={`${s.range_sessions} buổi học`} icon={TrendingUp} />
            </>
          )}
        </div>
      )}

      {/* min-w-0: không cho biểu đồ/bảng đẩy cột grid rộng quá màn hình điện thoại */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <section aria-labelledby="trend-heading" className="min-w-0 rounded-xl border bg-card p-5 xl:col-span-3">
          <h2 id="trend-heading" className="mb-4 font-semibold">
            Chuyên cần theo tuần
          </h2>
          {trend.isPending ? <Skeleton className="h-72" /> : trend.isError ? <ErrorState error={trend.error} /> : <TrendChart data={trend.data} />}
        </section>

        <section aria-labelledby="risk-heading" className="min-w-0 rounded-xl border bg-card p-5 xl:col-span-2">
          <h2 id="risk-heading" className="mb-4 font-semibold">
            Sinh viên vắng quá ngưỡng
          </h2>
          {risk.isPending ? (
            <LoadingRows rows={3} />
          ) : risk.isError ? (
            <ErrorState error={risk.error} />
          ) : risk.data.length === 0 ? (
            <EmptyState title="Không có sinh viên nào vượt ngưỡng" />
          ) : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sinh viên</TableHead>
                    <TableHead className="hidden sm:table-cell">Lớp</TableHead>
                    <TableHead className="text-right">Vắng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {risk.data.map((r) => (
                    <TableRow key={`${r.class_id}-${r.student_id}`}>
                      <TableCell className="whitespace-normal">
                        <p className="font-medium">{r.full_name}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {r.student_code}
                          <span className="sm:hidden"> · {r.class_code}</span>
                        </p>
                      </TableCell>
                      <TableCell className="tabular hidden text-sm sm:table-cell">{r.class_code}</TableCell>
                      <TableCell className="text-right whitespace-normal">
                        <p className="tabular font-semibold text-absent">{fmtPct(r.absence_pct)}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {r.absent}/{r.sessions} buổi · ngưỡng {r.threshold_pct}%
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
