import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, LogOut, Menu as MenuIcon, Moon, ShieldAlert, Sun, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { setLanguage } from '../i18n';
import { useGet, useSend } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { getSocket } from '../lib/socket';
import { Button, cx, Select, Sheet } from './ui';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const THEME_KEY = 'roomora.theme';

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
}

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
}

function Notifications() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onNotification = (n: { title: string; body: string }) => {
      setToast(n);
      void client.invalidateQueries();
    };
    socket.on('notification', onNotification);
    return () => void socket.off('notification', onNotification);
  }, [client]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const query = useGet<{ unread: number; items: { _id: string; title: string; body: string; createdAt: string }[] }>('/auth/notifications');
  const markRead = useSend('post', '/auth/notifications/read');
  const unread = query.data?.unread ?? 0;
  return (
    <>
      <Button
        variant="ghost"
        className="relative px-2"
        aria-label={t('Notifications, {{count}} unread', { count: unread })}
        onClick={() => {
          setOpen(true);
          if (unread) markRead.mutate({});
        }}
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-danger-text px-1 text-[10px] leading-4 text-white">{unread}</span>}
      </Button>
      {toast && (
        <div role="status" className="fixed inset-x-4 top-16 z-50 mx-auto max-w-sm rounded-lg border border-border bg-surface p-3 shadow-overlay">
          <p className="font-semibold">{toast.title}</p>
          <p className="text-sm text-text-muted">{toast.body}</p>
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('Notifications')}>
        {query.data?.items.length ? (
          <ul className="space-y-3">
            {query.data.items.map((n) => (
              <li key={n._id} className="border-b border-border pb-3">
                <p className="font-medium">{n.title}</p>
                <p className="text-text-muted">{n.body}</p>
                <p className="text-xs text-text-muted">{formatDate(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-text-muted">{t('Nothing new.')}</p>}
      </Sheet>
    </>
  );
}

function UserControls() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  return (
    <>
      <Select aria-label={t('Language')} className="hidden w-auto sm:block" value={i18n.language} onChange={(e) => setLanguage(e.target.value)}>
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
      </Select>
      <Button
        variant="ghost"
        className="px-2"
        aria-label={t('Switch theme')}
        onClick={() => {
          applyTheme(!dark);
          localStorage.setItem(THEME_KEY, dark ? 'light' : 'dark');
          setDark(!dark);
        }}
      >
        {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
      </Button>
      <Button
        variant="ghost"
        className="px-2"
        aria-label={t('Log out')}
        onClick={async () => {
          await signOut();
          navigate('/login');
        }}
      >
        <LogOut className="size-5" aria-hidden />
      </Button>
    </>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium', isActive ? 'bg-primary-soft text-primary' : 'text-text-muted hover:bg-surface-muted hover:text-text');

function SideNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('Main')} className="space-y-1">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={onNavigate}>
          <item.icon className="size-5 shrink-0" aria-hidden />
          <span className="truncate">{t(item.label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function ImpersonationBanner() {
  const { t } = useTranslation();
  const { me } = useAuth();
  if (!me?.impersonatedBy) return null;
  return (
    <div role="alert" className="flex items-center justify-center gap-2 bg-danger-text px-4 py-2 text-sm font-medium text-white">
      <ShieldAlert className="size-4" aria-hidden /> {t('You are impersonating {{name}}. Every action is audited.', { name: me.user.name || me.user.phone })}
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 font-brand text-lg font-bold">
      <img src="/roomora-icon.svg" alt="" className="size-8" />
      <span className="hidden sm:inline md:hidden lg:inline">room<span className="text-primary">ora</span></span>
    </Link>
  );
}

/** Sidebar from lg, icon rail on md, top bar with bottom tabs under md. */
export function AppShell({ nav, tabs, title, topbar }: { nav: NavItem[]; tabs: NavItem[]; title?: string; topbar?: ReactNode }) {
  const { t } = useTranslation();
  const [more, setMore] = useState(false);
  useEffect(() => initTheme(), []);
  return (
    <div className="min-h-dvh bg-background">
      <ImpersonationBanner />
      <div className="flex">
        <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-3 md:flex lg:w-[248px]">
          <div className="px-1"><Brand /></div>
          <SideNav items={nav} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 border-b border-border bg-surface px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <div className="md:hidden"><Brand /></div>
              <p className="hidden truncate font-semibold md:block">{title}</p>
              <div className="min-w-0">{topbar}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Notifications />
              <UserControls />
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 pb-24 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
      <nav aria-label={t('Tabs')} className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => cx('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-primary' : 'text-text-muted')}
          >
            <tab.icon className="size-5" aria-hidden />
            {t(tab.label)}
          </NavLink>
        ))}
        {nav.length > tabs.length && (
          <button type="button" onClick={() => setMore(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-text-muted">
            <MenuIcon className="size-5" aria-hidden />
            {t('More')}
          </button>
        )}
      </nav>
      <Dialog.Root open={more} onOpenChange={setMore}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/50" />
          <Dialog.Content aria-describedby={undefined} className="safe-bottom fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-xl bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold">{t('More')}</Dialog.Title>
              <Dialog.Close asChild><Button variant="ghost" className="px-2" aria-label={t('Close')}><X className="size-5" aria-hidden /></Button></Dialog.Close>
            </div>
            <SideNav items={nav} onNavigate={() => setMore(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
