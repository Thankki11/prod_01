import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Lock, Pencil, Play, QrCode } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { cn } from 'cn'

import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState, LoadingRows } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { api, download } from '@/lib/api'
import { fmtDateTime, fmtTime, SESSION_STATUS_LABEL, STATUS_LABEL } from '@/lib/format'
import type { AttendanceRow, AttendanceStatus, ClassItem, ClassSession } from '@/lib/types'

function ManualMarkDialog({ sessionId, row, onClose }: { sessionId: string; row: AttendanceRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<AttendanceStatus>('present')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const mutation = useMutation({
    mutationFn: () =>
      api(`/sessions/${sessionId}/attendance/${row!.student_id}`, { method: 'PUT', json: { status, note } }),
    onSuccess: () => {
      toast.success(`Đã cập nhật: ${row!.full_name} — ${STATUS_LABEL[status]}`)
      qc.invalidateQueries({ queryKey: ['attendance', sessionId] })
      qc.invalidateQueries({ queryKey: ['session', sessionId] })
      onClose()
    },
    onError: (e) => setError(e.message),
  })

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (open) return
        onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Điểm danh thủ công</DialogTitle>
          <DialogDescription>
            {row?.full_name} {row?.student_code && `(${row.student_code})`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (note.trim().length < 3) return setError('Ghi lý do (tối thiểu 3 ký tự)')
            mutation.mutate()
          }}
        >
          <FormField id="mark-status" label="Trạng thái">
            <NativeSelect id="mark-status" value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)} className="w-full">
              {(['present', 'late', 'absent'] as const).map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {STATUS_LABEL[s]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="mark-note" label="Lý do" error={error}>
            <Textarea
              id="mark-note"
              value={note}
              onChange={(e) => {
                setNote(e.target.value)
                setError(undefined)
              }}
              placeholder="VD: Điện thoại hết pin, đã xác nhận có mặt"
              maxLength={500}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SessionPage() {
  const { sessionId = '' } = useParams()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<AttendanceRow | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api<ClassSession>(`/sessions/${sessionId}`),
    refetchInterval: (q) => (q.state.data?.status === 'open' ? 5000 : false),
  })
  const cls = useQuery({
    queryKey: ['class', session.data?.class_id],
    queryFn: () => api<ClassItem>(`/classes/${session.data!.class_id}`),
    enabled: !!session.data,
  })
  const rows = useQuery({
    queryKey: ['attendance', sessionId],
    queryFn: () => api<AttendanceRow[]>(`/sessions/${sessionId}/attendance`),
    refetchInterval: session.data?.status === 'open' ? 5000 : false,
  })

  const action = useMutation({
    mutationFn: (kind: 'open' | 'close') => api<ClassSession>(`/sessions/${sessionId}/${kind}`, { method: 'POST' }),
    onSuccess: (data, kind) => {
      qc.setQueryData(['session', sessionId], data)
      qc.invalidateQueries({ queryKey: ['attendance', sessionId] })
      qc.invalidateQueries({ queryKey: ['sessions', data.class_id] })
      toast.success(kind === 'open' ? 'Đã mở điểm danh' : 'Đã đóng điểm danh, sinh viên chưa quét được ghi vắng')
      setConfirmClose(false)
    },
    onError: (e) => toast.error(e.message),
  })

  if (session.isPending) return <LoadingRows rows={6} />
  if (session.isError) return <ErrorState error={session.error} onRetry={() => session.refetch()} />

  const s = session.data
  const c = s.counts
  const pending = c.total_students - c.present - c.late - c.absent

  return (
    <>
      <Link to={`/lop/${s.class_id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 mb-2')}>
        <ArrowLeft aria-hidden /> {cls.data ? `${cls.data.code} · ${cls.data.name}` : 'Về lớp'}
      </Link>
      <PageHeader
        title={s.title}
        description={
          <>
            Bắt đầu {fmtDateTime(s.starts_at)} · <span className="font-medium text-foreground">{SESSION_STATUS_LABEL[s.status]}</span>
          </>
        }
        actions={
          <>
            {s.status === 'scheduled' && (
              <Button onClick={() => action.mutate('open')} disabled={action.isPending}>
                <Play aria-hidden /> Mở điểm danh
              </Button>
            )}
            {s.status === 'open' && (
              <>
                <Link to={`/buoi/${s.id}/qr`} className={buttonVariants()}>
                  <QrCode aria-hidden /> Chiếu mã QR
                </Link>
                <Button variant="outline" onClick={() => setConfirmClose(true)}>
                  <Lock aria-hidden /> Đóng điểm danh
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={() => download(`/sessions/${s.id}/attendance/export.csv`, 'diem-danh.csv').catch((e) => toast.error(e.message))}
            >
              <Download aria-hidden /> Xuất CSV
            </Button>
          </>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Có mặt', value: c.present, tone: 'text-present' },
          { label: 'Đi muộn', value: c.late, tone: 'text-late' },
          { label: 'Vắng', value: c.absent, tone: 'text-absent' },
          { label: 'Chưa điểm danh', value: Math.max(0, pending), tone: 'text-muted-foreground' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{k.label}</dt>
            <dd className={cn('tabular mt-1 text-2xl font-semibold', k.tone)}>{k.value}</dd>
          </div>
        ))}
      </dl>

      {rows.isPending ? (
        <LoadingRows />
      ) : rows.isError ? (
        <ErrorState error={rows.error} onRetry={() => rows.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã SV</TableHead>
                <TableHead>Họ tên</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Giờ</TableHead>
                <TableHead className="hidden md:table-cell">Ghi chú</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Thao tác</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.data.map((r) => (
                <TableRow key={r.student_id}>
                  <TableCell className="tabular">{r.student_code ?? '—'}</TableCell>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                    {r.method === 'manual' && <span className="ml-2 text-xs text-muted-foreground">thủ công</span>}
                  </TableCell>
                  <TableCell className="tabular">{r.status && r.status !== 'absent' ? fmtTime(r.checked_in_at) : '—'}</TableCell>
                  <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell" title={r.note ?? undefined}>
                    {r.note ?? ''}
                  </TableCell>
                  <TableCell>
                    {s.status !== 'scheduled' && (
                      <Button variant="ghost" size="icon" onClick={() => setEditing(r)} aria-label={`Sửa điểm danh của ${r.full_name}`}>
                        <Pencil aria-hidden />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && <ManualMarkDialog key={editing.student_id} sessionId={sessionId} row={editing} onClose={() => setEditing(null)} />}

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đóng điểm danh?</DialogTitle>
            <DialogDescription>
              {pending > 0 ? `${pending} sinh viên chưa điểm danh sẽ được ghi là Vắng. ` : ''}
              Sau khi đóng không mở lại được, nhưng vẫn sửa thủ công được từng sinh viên.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClose(false)}>
              Huỷ
            </Button>
            <Button onClick={() => action.mutate('close')} disabled={action.isPending}>
              Đóng điểm danh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
