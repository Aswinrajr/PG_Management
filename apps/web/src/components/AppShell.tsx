import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronRight, LogOut, Menu as MenuIcon, Moon, ShieldAlert, Sun, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
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
  /** Heading shown above this item in the sidebar, starting a new group. */
  section?: string;
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
  const [toast, setToast] = useState<{ title: string; body: string; link?: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const socket = getSocket();
    const onNotification = (n: { title: string; body: string; link?: string }) => {
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

  const query = useGet<{ unread: number; items: { _id: string; title: string; body: string; link?: string; createdAt: string }[] }>('/auth/notifications');
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
          {toast.link && <Button variant="secondary" className="mt-2" onClick={() => { navigate(toast.link!); setToast(null); }}>{t('View')}</Button>}
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('Notifications')}>
        {query.data?.items.length ? (
          <ul className="space-y-2">
            {query.data.items.map((n) => {
              const body = (
                <>
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"><Bell className="size-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{n.title}</span>
                    <span className="block text-text-muted">{n.body}</span>
                    <span className="block text-xs text-text-muted">{formatDate(n.createdAt)}</span>
                    {n.link && <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary">{t('View details')} <ChevronRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden /></span>}
                  </span>
                </>
              );
              const card = 'flex w-full gap-3 rounded-md border border-border p-3 text-left';
              return (
                <li key={n._id}>
                  {n.link ? (
                    <button
                      type="button"
                      className={cx(card, 'group cursor-pointer transition-colors duration-150 hover:border-primary hover:bg-primary-soft')}
                      onClick={() => {
                        setOpen(false);
                        navigate(n.link!);
                      }}
                    >
                      {body}
                    </button>
                  ) : <div className={card}>{body}</div>}
                </li>
              );
            })}
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
  cx(
    'group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150',
    isActive
      ? 'bg-primary-soft text-primary before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-primary'
      : 'text-text-muted hover:bg-surface-muted hover:text-text',
  );

/** `rail` is the md icon-only sidebar: section names become thin dividers there. */
function SideNav({ items, onNavigate, rail }: { items: NavItem[]; onNavigate?: () => void; rail?: boolean }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('Main')} className="space-y-0.5">
      {items.map((item) => (
        <div key={item.to}>
          {item.section && (
            <>
              <p className={cx('px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-text-muted/80', rail && 'hidden lg:block')}>{t(item.section)}</p>
              {rail && <hr className="mx-2 my-3 border-border lg:hidden" />}
            </>
          )}
          <NavLink to={item.to} end={item.end} className={linkClass} onClick={onNavigate} title={t(item.label)}>
            <item.icon className="size-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110" aria-hidden />
            <span className={cx('truncate', rail && 'md:hidden lg:inline')}>{t(item.label)}</span>
          </NavLink>
        </div>
      ))}
    </nav>
  );
}

function UserCard() {
  const { t } = useTranslation();
  const { me, workspace } = useAuth();
  const name = me?.user.name || me?.user.phone || '';
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const role = me?.isSuperAdmin ? t('Platform admin') : workspace?.role === 'resident' ? t('Resident') : t('Owner');
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted/50 p-2 md:justify-center lg:justify-start">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary to-secondary text-xs font-bold text-white">{initials || '?'}</span>
      <span className="min-w-0 md:hidden lg:block">
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span className="block truncate text-xs text-text-muted">{role}</span>
      </span>
    </div>
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
  const { pathname } = useLocation();
  useEffect(() => initTheme(), []);
  return (
    <div className="min-h-dvh bg-background">
      <ImpersonationBanner />
      <div className="flex">
        <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col border-r border-border bg-surface md:flex lg:w-[256px]">
          <div className="flex min-h-14 items-center px-4 md:justify-center lg:justify-start"><Brand /></div>
          <div className="nav-scroll flex-1 overflow-y-auto px-3 pb-4">
            <SideNav items={nav} rail />
          </div>
          <div className="border-t border-border p-3"><UserCard /></div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 border-b border-border bg-surface/80 px-4 backdrop-blur-lg md:px-6">
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
            <div key={pathname} className="page-enter"><Outlet /></div>
          </main>
        </div>
      </div>
      <nav aria-label={t('Tabs')} className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/85 px-1 backdrop-blur-lg md:hidden">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => cx('group flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors', isActive ? 'text-primary' : 'text-text-muted')}
          >
            {({ isActive }) => (
              <>
                <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200', isActive && 'bg-primary-soft')}><tab.icon className="size-5" aria-hidden /></span>
                {t(tab.label)}
              </>
            )}
          </NavLink>
        ))}
        {nav.length > tabs.length && (
          <button type="button" onClick={() => setMore(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-text-muted">
            <span className="flex h-7 w-12 items-center justify-center"><MenuIcon className="size-5" aria-hidden /></span>
            {t('More')}
          </button>
        )}
      </nav>
      <Dialog.Root open={more} onOpenChange={setMore}>
        <Dialog.Portal>
          <Dialog.Overlay className="sheet-overlay fixed inset-0 z-40 bg-slate-950/50" />
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
