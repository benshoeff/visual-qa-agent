import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  ScanSearch,
  Play,
  Clock,
  FileBarChart2,
  Menu,
  Sun,
  Moon,
  Monitor,
  Sparkles,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/hooks/use-theme'
import type { Theme } from '@/hooks/use-theme'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pages', label: 'Pages', icon: FileText },
  { to: '/crawl', label: 'Site Crawler', icon: ScanSearch },
  { to: '/runner', label: 'Test Runner', icon: Play },
  { to: '/history', label: 'Run History', icon: History },
  { to: '/schedules', label: 'Schedules', icon: Clock },
  { to: '/reports', label: 'Reports', icon: FileBarChart2 },
]

function ThemeToggle() {
  const [theme, setTheme] = useTheme()

  const cycle = () => {
    const order: Theme[] = ['light', 'dark', 'system']
    const next = order[(order.indexOf(theme) + 1) % order.length]
    setTheme(next)
  }

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={cycle}
          aria-label={`Theme: ${theme}. Click to change`}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{`Theme: ${theme}`}</TooltipContent>
    </Tooltip>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">Visual QA</span>
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Dashboard
        </span>
      </div>
    </div>
  )
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main navigation">
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              isActive && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary'
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={cn('size-4.5 shrink-0', isActive && 'text-primary')}
                aria-hidden="true"
              />
              <span>{label}</span>
              {isActive && (
                <span className="ml-auto size-1.5 rounded-full bg-primary" aria-hidden="true" />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <Brand />
        <Nav />
        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">v1.0</span>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="px-0 pt-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1">
                <Brand />
                <Nav onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="mt-auto flex items-center justify-between border-t px-4 py-3">
                <span className="text-xs text-muted-foreground">v1.0</span>
                <ThemeToggle />
              </div>
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold">Visual QA</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}