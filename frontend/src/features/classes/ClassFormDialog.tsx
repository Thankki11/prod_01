import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { api } from '@/lib/api'
import type { ClassItem, Page, Subject, User } from '@/lib/types'

const schema = z.object({
  code: z.string().trim().min(1, 'Nhập mã lớp').max(32),
  name: z.string().trim().min(1, 'Nhập tên lớp').max(128),
  subject_id: z.coerce.number<string>().int().positive('Chọn môn học'),
  lecturer_id: z.string(),
  semester: z.string().trim().max(32),
  late_after_minutes: z.coerce.number<string>().int().min(0).max(240),
  absence_threshold_pct: z.coerce.number<string>().int().min(1).max(100),
})
type FormInput = z.input<typeof schema>

export function ClassFormDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: ClassItem }) {
  const qc = useQueryClient()
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<Subject[]>('/subjects'), enabled: open })
  const lecturers = useQuery({
    queryKey: ['users', 'lecturers'],
    queryFn: () => api<Page<User>>('/users?role=lecturer&size=100'),
    enabled: open,
  })
  const { register, handleSubmit, formState } = useForm<FormInput, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    values: {
      code: editing?.code ?? '',
      name: editing?.name ?? '',
      subject_id: String(editing?.subject.id ?? ''),
      lecturer_id: String(editing?.lecturer?.id ?? ''),
      semester: editing?.semester ?? '',
      late_after_minutes: String(editing?.late_after_minutes ?? 15),
      absence_threshold_pct: String(editing?.absence_threshold_pct ?? 20),
    },
  })

  const save = useMutation({
    mutationFn: (v: z.output<typeof schema>) => {
      const body = { ...v, lecturer_id: v.lecturer_id ? Number(v.lecturer_id) : null }
      return editing
        ? api<ClassItem>(`/classes/${editing.id}`, { method: 'PATCH', json: body })
        : api<ClassItem>('/classes', { method: 'POST', json: body })
    },
    onSuccess: (c) => {
      toast.success(editing ? 'Đã lưu lớp' : `Đã tạo lớp ${c.code}`)
      qc.invalidateQueries({ queryKey: ['classes'] })
      qc.invalidateQueries({ queryKey: ['class', c.id] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(e.message),
  })

  const err = formState.errors
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Sửa lớp' : 'Tạo lớp mới'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2">
          <FormField id="code" label="Mã lớp" error={err.code?.message}>
            <Input id="code" {...register('code')} />
          </FormField>
          <FormField id="semester" label="Học kỳ">
            <Input id="semester" placeholder="HK1 2026-2027" {...register('semester')} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="name" label="Tên lớp" error={err.name?.message}>
              <Input id="name" {...register('name')} />
            </FormField>
          </div>
          <FormField id="subject_id" label="Môn học" error={err.subject_id?.message}>
            <NativeSelect id="subject_id" className="w-full" {...register('subject_id')}>
              <NativeSelectOption value="">— Chọn môn —</NativeSelectOption>
              {subjects.data?.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="lecturer_id" label="Giảng viên phụ trách">
            <NativeSelect id="lecturer_id" className="w-full" {...register('lecturer_id')}>
              <NativeSelectOption value="">— Chưa phân công —</NativeSelectOption>
              {lecturers.data?.items.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.full_name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="late" label="Tính muộn sau (phút)" error={err.late_after_minutes?.message}>
            <Input id="late" type="number" inputMode="numeric" min={0} max={240} {...register('late_after_minutes')} />
          </FormField>
          <FormField id="threshold" label="Ngưỡng vắng cảnh báo (%)" error={err.absence_threshold_pct?.message}>
            <Input id="threshold" type="number" inputMode="numeric" min={1} max={100} {...register('absence_threshold_pct')} />
          </FormField>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {editing ? 'Lưu' : 'Tạo lớp'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
