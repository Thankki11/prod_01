import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

const schema = z
  .object({
    current_password: z.string().min(1, 'Nhập mật khẩu hiện tại'),
    new_password: z.string().min(8, 'Tối thiểu 8 ký tự'),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Mật khẩu nhập lại không khớp' })
type FormValues = z.infer<typeof schema>

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false)
  const { register, handleSubmit, formState, reset, setError } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async ({ current_password, new_password }) => {
    try {
      await api('/auth/change-password', { method: 'POST', json: { current_password, new_password } })
      toast.success('Đã đổi mật khẩu')
      reset()
      setOpen(false)
    } catch (e) {
      setError('current_password', { message: e instanceof Error ? e.message : 'Không đổi được mật khẩu' })
    }
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" aria-label="Đổi mật khẩu" title="Đổi mật khẩu" />}>
        <KeyRound aria-hidden />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi mật khẩu</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormField id="current_password" label="Mật khẩu hiện tại" error={formState.errors.current_password?.message}>
            <Input id="current_password" type="password" autoComplete="current-password" {...register('current_password')} />
          </FormField>
          <FormField id="new_password" label="Mật khẩu mới" error={formState.errors.new_password?.message} hint="Tối thiểu 8 ký tự">
            <Input id="new_password" type="password" autoComplete="new-password" {...register('new_password')} />
          </FormField>
          <FormField id="confirm" label="Nhập lại mật khẩu mới" error={formState.errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={formState.isSubmitting}>
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
