import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Maximize, Users } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { cn } from 'cn'

import { Button, buttonVariants } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { ClassSession, QrInfo } from '@/lib/types'

/** Vòng đếm ngược tới lần đổi mã kế tiếp */
function Countdown({ expiresAt, total }: { expiresAt: number; total: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const left = Math.max(0, (expiresAt - now) / 1000)
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid size-16 place-items-center" aria-hidden>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#15803d"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - left / total)}
          className="transition-[stroke-dashoffset] duration-200 ease-linear"
        />
      </svg>
      <span className="tabular text-lg font-semibold text-slate-900">{Math.ceil(left)}</span>
    </div>
  )
}

export function QrPresentPage() {
  const { sessionId } = useParams()
  const session = useQuery({ queryKey: ['session', sessionId], queryFn: () => api<ClassSession>(`/sessions/${sessionId}`) })
  const isOpen = session.data?.status === 'open'

  const qr = useQuery({
    queryKey: ['qr', sessionId],
    queryFn: async () => {
      const data = await api<QrInfo>(`/sessions/${sessionId}/qr`)
      return { ...data, expiresAt: Date.now() + data.expires_in * 1000 }
    },
    enabled: isOpen,
    // Lấy mã mới ngay khi mã hiện tại hết hạn; số người đã điểm danh cập nhật theo
    refetchInterval: (q) => (q.state.data ? Math.max(500, q.state.data.expiresAt - Date.now() + 150) : 2000),
    refetchIntervalInBackground: true,
    retry: true,
  })

  const fullscreen = () => document.documentElement.requestFullscreen?.()

  // Nền luôn trắng (kể cả khi chọn giao diện tối) để camera điện thoại dễ nhận mã
  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <Link
          to={`/buoi/${sessionId}`}
          className={cn(buttonVariants({ variant: 'ghost' }), 'text-slate-700 hover:bg-slate-100 hover:text-slate-900')}
        >
          <ArrowLeft aria-hidden /> Quay lại
        </Link>
        <p className="truncate text-sm font-medium text-slate-600">{session.data?.title}</p>
        <Button variant="ghost" onClick={fullscreen} className="text-slate-700 hover:bg-slate-100 hover:text-slate-900">
          <Maximize aria-hidden /> Toàn màn hình
        </Button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
        {!session.data ? null : !isOpen ? (
          <div className="text-center">
            <p className="text-2xl font-semibold">Buổi học chưa mở hoặc đã kết thúc điểm danh</p>
            <Link to={`/buoi/${sessionId}`} className={cn(buttonVariants({ size: 'lg' }), 'mt-6')}>
              Về trang buổi học
            </Link>
          </div>
        ) : qr.data ? (
          <>
            <h1 className="text-center text-2xl font-semibold md:text-4xl">Quét mã để điểm danh</h1>
            <div className="rounded-2xl border border-slate-200 p-4 shadow-sm">
              <QRCodeSVG
                value={qr.data.url}
                size={512}
                level="M"
                marginSize={2}
                className="h-auto w-[min(80vw,65vh)] max-w-full"
                title="Mã QR điểm danh"
              />
            </div>
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <Countdown key={qr.data.token} expiresAt={qr.data.expiresAt} total={qr.data.rotate_seconds} />
                <span className="text-slate-600">giây tới mã mới</span>
              </div>
              <div className="flex items-center gap-2 text-xl" aria-live="polite">
                <Users className="size-6 text-green-700" aria-hidden />
                <span className="tabular font-semibold">
                  {qr.data.checked_in}/{qr.data.total_students}
                </span>
                <span className="text-slate-600">đã điểm danh</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-slate-600" role="status">
            Đang tạo mã…
          </p>
        )}
      </main>
    </div>
  )
}
