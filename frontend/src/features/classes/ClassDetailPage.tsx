import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { cn } from 'cn'

import { ClassFormDialog } from './ClassFormDialog'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingRows } from '@/components/QueryState'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, download } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtDateTime, SESSION_STATUS_LABEL, toLocalInputValue } from '@/lib/format'
import type { ClassItem, ClassSession, ImportResult, StudentInClass } from '@/lib/types'

function NewSessionDialog({ classId, open, onOpenChange }: { classId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(new Date()))
  const create = useMutation({
    mutationFn: () =>
      api<ClassSession>(`/classes/${classId}/sessions`, {
        method: 'POST',
        // datetime-local là giờ máy người dùng; đổi sang ISO (UTC) trước khi gửi
        json: { title: title.trim(), starts_at: new Date(startsAt).toISOString() },
      }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['sessions', Number(classId)] })
      navigate(`/buoi/${s.id}`)
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo buổi học</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim()) create.mutate()
          }}
        >
          <FormField id="session-title" label="Tên buổi">
            <Input id="session-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Buổi 3 — React Hooks" required maxLength={128} />
          </FormField>
          <FormField id="session-start" label="Giờ bắt đầu" hint="Dùng để tính đi muộn theo ngưỡng của lớp">
            <Input id="session-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              Tạo buổi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ImportCsvButton({ classId }: { classId: string }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api<ImportResult>(`/classes/${classId}/students/import`, { method: 'POST', form })
    },
    onSuccess: (r) => {
      setResult(r)
      qc.invalidateQueries({ queryKey: ['students', classId] })
      qc.invalidateQueries({ queryKey: ['class', Number(classId)] })
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => {
      if (input.current) input.current.value = ''
    },
  })
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label="Chọn file CSV danh sách sinh viên"
        onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
      />
      <Button variant="outline" onClick={() => input.current?.click()} disabled={upload.isPending}>
        <Upload aria-hidden /> {upload.isPending ? 'Đang nhập…' : 'Nhập CSV'}
      </Button>
      <Dialog open={result !== null} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kết quả nhập danh sách</DialogTitle>
            <DialogDescription>
              Thêm vào lớp {result?.enrolled} sinh viên (tạo mới {result?.created} tài khoản), {result?.already_enrolled} đã có trong lớp.
            </DialogDescription>
          </DialogHeader>
          {result && result.created > 0 && (
            <p className="text-sm text-muted-foreground">
              Tài khoản mới: tên đăng nhập là mã SV viết thường, mật khẩu ban đầu là mã SV (nếu file không có cột password). Nhắc sinh viên đổi
              mật khẩu sau khi đăng nhập.
            </p>
          )}
          {result && result.errors.length > 0 && (
            <div className="max-h-60 overflow-y-auto rounded-lg border p-3 text-sm">
              <p className="mb-2 font-medium text-destructive">{result.errors.length} dòng bị bỏ qua:</p>
              <ul className="grid gap-1">
                {result.errors.map((e) => (
                  <li key={e.line}>
                    <span className="tabular text-muted-foreground">Dòng {e.line}:</span> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResult(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ClassDetailPage() {
  const { classId = '' } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [newSession, setNewSession] = useState(false)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState<StudentInClass | null>(null)

  const cls = useQuery({ queryKey: ['class', Number(classId)], queryFn: () => api<ClassItem>(`/classes/${classId}`) })
  const sessions = useQuery({ queryKey: ['sessions', Number(classId)], queryFn: () => api<ClassSession[]>(`/classes/${classId}/sessions`) })
  const students = useQuery({ queryKey: ['students', classId], queryFn: () => api<StudentInClass[]>(`/classes/${classId}/students`) })

  const remove = useMutation({
    mutationFn: (sv: StudentInClass) => api(`/classes/${classId}/students/${sv.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã xoá sinh viên khỏi lớp')
      setRemoving(null)
      qc.invalidateQueries({ queryKey: ['students', classId] })
      qc.invalidateQueries({ queryKey: ['class', Number(classId)] })
    },
    onError: (e) => toast.error(e.message),
  })

  if (cls.isPending) return <LoadingRows rows={6} />
  if (cls.isError) return <ErrorState error={cls.error} onRetry={() => cls.refetch()} />
  const c = cls.data

  return (
    <>
      <Link to="/lop" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 mb-2')}>
        <ArrowLeft aria-hidden /> Lớp học
      </Link>
      <PageHeader
        title={c.name}
        description={`${c.code} · ${c.subject.name}${c.semester ? ` · ${c.semester}` : ''} · GV: ${c.lecturer?.full_name ?? 'chưa phân công'} · Muộn sau ${c.late_after_minutes} phút`}
        actions={
          <>
            <Button onClick={() => setNewSession(true)}>
              <Plus aria-hidden /> Tạo buổi học
            </Button>
            <Button
              variant="outline"
              onClick={() => download(`/classes/${c.id}/attendance/export.csv`, 'diem-danh.csv').catch((e) => toast.error(e.message))}
            >
              <Download aria-hidden /> Xuất CSV cả lớp
            </Button>
            {user?.role === 'admin' && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden /> Sửa lớp
              </Button>
            )}
          </>
        }
      />

      <section aria-labelledby="sessions-heading" className="mb-10">
        <h2 id="sessions-heading" className="mb-3 text-lg font-semibold">
          Buổi học
        </h2>
        {sessions.isPending ? (
          <LoadingRows rows={3} />
        ) : sessions.isError ? (
          <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
        ) : sessions.data.length === 0 ? (
          <EmptyState title="Chưa có buổi học">Bấm "Tạo buổi học" rồi mở điểm danh để sinh viên quét QR.</EmptyState>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {sessions.data.map((s) => (
              <li key={s.id}>
                <Link to={`/buoi/${s.id}`} className="flex min-h-14 items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="text-sm text-muted-foreground">{fmtDateTime(s.starts_at)}</p>
                  </div>
                  <span
                    className={cn(
                      'hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline',
                      s.status === 'open' ? 'bg-present-soft text-present' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {SESSION_STATUS_LABEL[s.status]}
                  </span>
                  <span className="tabular text-sm text-muted-foreground">
                    {s.counts.present + s.counts.late}/{s.counts.total_students}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="students-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="students-heading" className="text-lg font-semibold">
            Sinh viên <span className="tabular font-normal text-muted-foreground">({c.student_count})</span>
          </h2>
          <ImportCsvButton classId={classId} />
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          File CSV (UTF-8) cần cột <code className="rounded bg-muted px-1">student_code</code>, <code className="rounded bg-muted px-1">full_name</code>; có
          thể thêm <code className="rounded bg-muted px-1">username</code>, <code className="rounded bg-muted px-1">password</code>.
        </p>
        {students.isPending ? (
          <LoadingRows />
        ) : students.isError ? (
          <ErrorState error={students.error} onRetry={() => students.refetch()} />
        ) : students.data.length === 0 ? (
          <EmptyState title="Lớp chưa có sinh viên">Nhập danh sách từ file CSV.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã SV</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead className="hidden sm:table-cell">Tên đăng nhập</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Thao tác</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.data.map((sv) => (
                  <TableRow key={sv.id}>
                    <TableCell className="tabular">{sv.student_code}</TableCell>
                    <TableCell className="font-medium">
                      {sv.full_name}
                      {!sv.is_active && <span className="ml-2 text-xs text-muted-foreground">(đã khoá)</span>}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{sv.username}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setRemoving(sv)} aria-label={`Xoá ${sv.full_name} khỏi lớp`}>
                        <Trash2 aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <NewSessionDialog classId={classId} open={newSession} onOpenChange={setNewSession} />
      {user?.role === 'admin' && <ClassFormDialog open={editing} onOpenChange={setEditing} editing={c} />}
      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá khỏi lớp?</DialogTitle>
            <DialogDescription>
              {removing?.full_name} sẽ không quét được QR của lớp này nữa. Lịch sử điểm danh cũ vẫn được giữ.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Huỷ
            </Button>
            <Button variant="destructive" onClick={() => removing && remove.mutate(removing)} disabled={remove.isPending}>
              Xoá khỏi lớp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
