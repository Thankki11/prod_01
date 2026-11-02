import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import type { Subject } from '@/lib/types'

type Editing = { mode: 'create' } | { mode: 'edit'; subject: Subject } | null

export function SubjectsPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Editing>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<Subject[]>('/subjects') })

  const openDialog = (e: Editing) => {
    setEditing(e)
    setCode(e?.mode === 'edit' ? e.subject.code : '')
    setName(e?.mode === 'edit' ? e.subject.name : '')
  }

  const save = useMutation({
    mutationFn: () =>
      editing?.mode === 'edit'
        ? api(`/subjects/${editing.subject.id}`, { method: 'PATCH', json: { code, name } })
        : api('/subjects', { method: 'POST', json: { code, name } }),
    onSuccess: () => {
      toast.success('Đã lưu môn học')
      qc.invalidateQueries({ queryKey: ['subjects'] })
      setEditing(null)
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (s: Subject) => api(`/subjects/${s.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã xoá môn học')
      qc.invalidateQueries({ queryKey: ['subjects'] })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <>
      <PageHeader
        title="Môn học"
        actions={
          <Button onClick={() => openDialog({ mode: 'create' })}>
            <Plus aria-hidden /> Thêm môn
          </Button>
        }
      />
      {subjects.isPending ? (
        <LoadingRows />
      ) : subjects.isError ? (
        <ErrorState error={subjects.error} onRetry={() => subjects.refetch()} />
      ) : subjects.data.length === 0 ? (
        <EmptyState title="Chưa có môn học" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã môn</TableHead>
                <TableHead>Tên môn</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Thao tác</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="tabular">{s.code}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <div className="flex">
                      <Button variant="ghost" size="icon" onClick={() => openDialog({ mode: 'edit', subject: s })} aria-label={`Sửa ${s.name}`}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.confirm(`Xoá môn "${s.name}"?`) && remove.mutate(s)}
                        aria-label={`Xoá ${s.name}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.mode === 'edit' ? 'Sửa môn học' : 'Thêm môn học'}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim() && name.trim()) save.mutate()
            }}
          >
            <FormField id="subject-code" label="Mã môn">
              <Input id="subject-code" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={32} />
            </FormField>
            <FormField id="subject-name" label="Tên môn">
              <Input id="subject-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={128} />
            </FormField>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending || !code.trim() || !name.trim()}>
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
