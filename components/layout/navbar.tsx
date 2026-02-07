'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Home,
  Phone,
  Mail,
  ArrowLeftRight,
  Bug,
  Webhook,
  LogOut,
  Menu,
  FileText,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  X,
} from 'lucide-react';
import { HelloCounselLogo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { EnvironmentSwitcher } from '@/components/layout/environment-switcher';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import type { User } from '@/types/api';

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/emails', label: 'Emails', icon: Mail },
  { href: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { href: '/sentry', label: 'Sentry', icon: Bug },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook },
];

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setUser(data.user);
        }
      })
      .catch(console.error);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const { setTheme, theme } = useTheme();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center px-4 md:px-6">
        {/* Mobile: Hamburger + Environment */}
        <div className="flex items-center gap-2 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64" hideCloseButton>
              <VisuallyHidden.Root>
                <SheetTitle>Navigation Menu</SheetTitle>
              </VisuallyHidden.Root>
              <div className="flex items-center justify-between px-3 pt-4 mb-6">
                <HelloCounselLogo className="h-6 w-auto text-foreground" />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(false)}>
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
              <nav className="flex flex-col gap-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    isActive={isActive(item.href)}
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          <EnvironmentSwitcher />
        </div>

        {/* Desktop: Branding section - matches filter sidebar width */}
        <div className="hidden md:flex md:w-64 shrink-0 items-center">
          <Link href="/" className="flex items-center gap-2">
            <HelloCounselLogo className="h-6 w-auto text-foreground" />
            <span className="text-muted-foreground text-sm font-medium">Dashboard</span>
          </Link>
        </div>

        {/* Desktop Navigation - starts after branding section */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={isActive(item.href)}
            />
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {/* Environment Switcher - Desktop only */}
          <div className="hidden md:block">
            <EnvironmentSwitcher />
          </div>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 gap-1 rounded-full px-2 md:px-1">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {user?.username?.charAt(0).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user?.username || 'User'}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.apps?.join(', ') || 'No apps'}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Theme
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setTheme('light')} className="cursor-pointer">
                <Sun className="mr-2 h-4 w-4" />
                Light
                {theme === 'light' && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')} className="cursor-pointer">
                <Moon className="mr-2 h-4 w-4" />
                Dark
                {theme === 'dark' && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')} className="cursor-pointer">
                <Monitor className="mr-2 h-4 w-4" />
                System
                {theme === 'system' && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
