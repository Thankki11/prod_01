import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/format'
import type { Page, Role, User } from '@/lib/types'

const PAGE_SIZE = 20
const ROLES: Role[] = ['admin', 'lecturer', 'student']

interface FormState {
  username: string
  full_name: string
  role: Role
  student_code: string
  password: string
  is_active: boolean
}

function UserDialog({ editing, onClose }: { editing: User | 'new'; onClose: () => void }) {
  const qc = useQueryClient()
  const isNew = editing === 'new'
  const [form, setForm] = useState<FormState>(
    isNew
      ? { username: '', full_name: '', role: 'student', student_code: '', password: '', is_active: true }
      : { username: editing.username, full_name: editing.full_name, role: editing.role, student_code: editing.student_code ?? '', password: '', is_active: editing.is_active },
  )
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: () => {
      const student_code = form.role === 'student' ? form.student_code.trim() || null : null
      if (isNew) return api('/users', { method: 'POST', json: { ...form, student_code } })
      const body: Record<string, unknown> = { full_name: form.full_name, role: form.role, student_code, is_active: form.is_active }
      if (form.password) body.password = form.password
      return api(`/users/${editing.id}`, { method: 'PATCH', json: body })
    },
    onSuccess: () => {
      toast.success(isNew ? 'Đã tạo người dùng' : 'Đã lưu')
      qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  const passwordOk = isNew ? form.password.length >= 8 : form.password === '' || form.password.length >= 8
  const valid = form.username.trim().length >= 3 && form.full_name.trim() && passwordOk

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Thêm người dùng' : `Sửa: ${editing.username}`}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) save.mutate()
          }}
        >
          <FormField id="u-username" label="Tên đăng nhập" hint={isNew ? 'Chữ, số, dấu . _ -' : undefined}>
            <Input
              id="u-username"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              disabled={!isNew}
              autoCapitalize="none"
              pattern="[A-Za-z0-9._\-]+"
              required
            />
          </FormField>
          <FormField id="u-role" label="Vai trò">
            <NativeSelect id="u-role" className="w-full" value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
              {ROLES.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {ROLE_LABEL[r]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="u-name" label="Họ tên">
              <Input id="u-name" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required />
            </FormField>
          </div>
          {form.role === 'student' && (
            <FormField id="u-code" label="Mã sinh viên">
              <Input id="u-code" value={form.student_code} onChange={(e) => set('student_code', e.target.value)} />
            </FormField>
          )}
          <FormField
            id="u-password"
            label={isNew ? 'Mật khẩu' : 'Đặt lại mật khẩu'}
            hint={isNew ? 'Tối thiểu 8 ký tự' : 'Bỏ trống nếu không đổi'}
            error={passwordOk ? undefined : 'Tối thiểu 8 ký tự'}
          >
            <Input id="u-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </FormField>
          {!isNew && (
            <label className="flex h-11 items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4 accent-primary" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
              Tài khoản đang hoạt động
            </label>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={!valid || save.isPending}>
              {isNew ? 'Tạo' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UsersPage() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const query = useDeferredValue(q)

  const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) })
  if (query.trim()) params.set('q', query.trim())
  if (role) params.set('role', role)
  const users = useQuery({
    queryKey: ['users', params.toString()],
    queryFn: () => api<Page<User>>(`/users?${params}`),
    placeholderData: keepPreviousData,
  })
  const remove = useMutation({
    mutationFn: (u: User) => api(`/users/${u.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã xoá người dùng')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / PAGE_SIZE)) : 1

  return (
    <>
      <PageHeader
        title="Người dùng"
        description={users.data && `${users.data.total} tài khoản`}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Thêm người dùng
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            className="pl-9"
            placeholder="Tìm theo tên, tên đăng nhập, mã SV"
            aria-label="Tìm người dùng"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <NativeSelect
          aria-label="Lọc theo vai trò"
          className="sm:w-48"
          value={role}
          onChange={(e) => {
            setRole(e.target.value)
            setPage(1)
          }}
        >
          <NativeSelectOption value="">Mọi vai trò</NativeSelectOption>
          {ROLES.map((r) => (
            <NativeSelectOption key={r} value={r}>
              {ROLE_LABEL[r]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {users.isPending ? (
        <LoadingRows rows={6} />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : users.data.items.length === 0 ? (
        <EmptyState title="Không tìm thấy người dùng" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Tên đăng nhập</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead className="hidden md:table-cell">Mã SV</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Thao tác</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.items.map((u) => (
                  <TableRow key={u.id} className={u.is_active ? undefined : 'opacity-60'}>
                    <TableCell className="font-medium">
                      {u.full_name}
                      {!u.is_active && <span className="ml-2 text-xs font-normal text-muted-foreground">(đã khoá)</span>}
                    </TableCell>
                    <TableCell>{u.username}</TableCell>
                    <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                    <TableCell className="tabular hidden md:table-cell">{u.student_code ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(u)} aria-label={`Sửa ${u.full_name}`}>
                          <Pencil aria-hidden />
                        </Button>
                        {u.id !== me?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.confirm(`Xoá tài khoản ${u.username}?`) && remove.mutate(u)}
                            aria-label={`Xoá ${u.full_name}`}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <nav aria-label="Phân trang" className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" size="icon" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Trang trước">
              <ChevronLeft aria-hidden />
            </Button>
            <span className="tabular text-sm text-muted-foreground">
              Trang {page}/{totalPages}
            </span>
            <Button variant="outline" size="icon" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} aria-label="Trang sau">
              <ChevronRight aria-hidden />
            </Button>
          </nav>
        </>
      )}
      {editing && <UserDialog key={editing === 'new' ? 'new' : editing.id} editing={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
