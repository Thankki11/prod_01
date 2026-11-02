import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'

const NEXT = { light: 'dark', dark: 'system', system: 'light' } as const
const LABEL = { light: 'Giao diện sáng', dark: 'Giao diện tối', system: 'Theo hệ thống' } as const

export function ThemeToggle() {
  const { theme: current, setTheme } = useTheme()
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(NEXT[current])}
      aria-label={`${LABEL[current]} — bấm để đổi`}
      title={LABEL[current]}
    >
      <Icon aria-hidden />
    </Button>
  )
}
