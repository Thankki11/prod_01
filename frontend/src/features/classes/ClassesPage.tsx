import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { ClassFormDialog } from './ClassFormDialog'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { ClassItem } from '@/lib/types'

export function ClassesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [creating, setCreating] = useState(false)
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api<ClassItem[]>('/classes') })

  return (
    <>
      <PageHeader
        title="Lớp học"
        description={isAdmin ? 'Tất cả lớp trong hệ thống' : 'Các lớp bạn phụ trách'}
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden /> Tạo lớp
            </Button>
          )
        }
      />
      {classes.isPending ? (
        <LoadingRows />
      ) : classes.isError ? (
        <ErrorState error={classes.error} onRetry={() => classes.refetch()} />
      ) : classes.data.length === 0 ? (
        <EmptyState title="Chưa có lớp nào">{isAdmin ? 'Bấm "Tạo lớp" để bắt đầu.' : 'Liên hệ quản trị viên để được phân công lớp.'}</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classes.data.map((c) => (
            <li key={c.id}>
              <Link
                to={`/lop/${c.id}`}
                className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="tabular text-xs font-medium text-muted-foreground">{c.code}</p>
                    <p className="mt-0.5 font-semibold">{c.name}</p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
                <p className="text-sm text-muted-foreground">
                  {c.subject.name}
                  {c.semester && ` · ${c.semester}`}
                </p>
                <div className="mt-auto flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4 text-muted-foreground" aria-hidden />
                    <span className="tabular">{c.student_count}</span> sinh viên
                  </span>
                  <span className="truncate text-muted-foreground">{c.lecturer?.full_name ?? 'Chưa phân công'}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && <ClassFormDialog open={creating} onOpenChange={setCreating} />}
    </>
  )
}
