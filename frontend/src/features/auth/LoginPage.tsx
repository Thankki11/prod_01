import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LoaderCircle, QrCode } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'

import { FullPageSpinner } from '@/app/guards'
import { FormField } from '@/components/FormField'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { homePathFor, useAuth } from '@/lib/auth'

const schema = z.object({
  username: z.string().trim().min(1, 'Nhập tên đăng nhập'),
  password: z.string().min(1, 'Nhập mật khẩu'),
})
type FormValues = z.infer<typeof schema>

/** Chỉ cho quay lại đường dẫn nội bộ, tránh bị lợi dụng chuyển hướng sang trang ngoài */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export function LoginPage() {
  const { state, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'authed') return <Navigate to={next ?? homePathFor(state.user.role)} replace />

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      const user = await login(values.username, values.password)
      navigate(next ?? homePathFor(user.role), { replace: true })
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Đăng nhập thất bại')
    }
  })

  const fromQr = next?.startsWith('/diem-danh')

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <QrCode className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Điểm Danh QR</h1>
            <p className="mt-1 text-sm text-muted-foreground">Đăng nhập để tiếp tục</p>
          </div>
        </div>

        {fromQr && (
          <Alert className="mb-4">
            <AlertDescription>
              Đăng nhập xong, nếu mã đã hết hạn hãy <strong>quét lại mã QR</strong> trên màn hình lớp.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-xl border bg-card p-6 shadow-xs">
          <FormField id="username" label="Tên đăng nhập" error={formState.errors.username?.message}>
            <Input
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              aria-invalid={!!formState.errors.username}
              aria-describedby={formState.errors.username ? 'username-error' : undefined}
              {...register('username')}
            />
          </FormField>
          <FormField id="password" label="Mật khẩu" error={formState.errors.password?.message}>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-11"
                aria-invalid={!!formState.errors.password}
                aria-describedby={formState.errors.password ? 'password-error' : undefined}
                {...register('password')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-0 right-0"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
            </div>
          </FormField>
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
          <Button type="submit" size="lg" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <LoaderCircle className="animate-spin" aria-hidden />}
            Đăng nhập
          </Button>
        </form>
      </div>
    </div>
  )
}
