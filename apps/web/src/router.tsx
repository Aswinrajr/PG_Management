import {
  BedDouble, Building2, ClipboardList, CreditCard, FileCheck2, FileText, Gauge, Home, LayoutDashboard, Megaphone, MessageSquareWarning,
  Radio, ReceiptIndianRupee, ScrollText, Settings, Trophy, User, Users, UtensilsCrossed, Wallet, WalletCards, WashingMachine, Zap,
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, useRouteError } from 'react-router';
import { AppShell, type NavItem } from './components/AppShell';
import { Button, ErrorState, ListSkeleton } from './components/ui';
import { AdminLoginPage, InvitePage, LoginPage, SelectWorkspacePage } from './features/auth/pages';
import { homeOf, useAuth } from './lib/auth';
import { PropertyProvider, PropertySwitcher } from './lib/property';

const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const owner = {
  dashboard: lazy(() => import('./features/dashboard/pages')),
  bedmap: lazy(() => import('./features/bedmap/pages')),
  onboarding: lazy(() => import('./features/onboarding/pages')),
};
const props = () => import('./features/properties/pages');
const residents = () => import('./features/residents/pages');
const billing = () => import('./features/billing/pages');
const ops = () => import('./features/ops/pages');
const me = () => import('./features/resident/pages');
const admin = () => import('./features/admin/pages');
const community = () => import('./features/community/pages');
const laundry = () => import('./features/laundry/pages');
const rooms = () => import('./features/rooms/pages');

const PendingApproval = named(() => import('./features/onboarding/pages'), 'PendingApprovalPage');

const OWNER_NAV: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/bedmap', label: 'Bed map', icon: BedDouble },
  { to: '/app/residents', label: 'Residents', icon: Users },
  { to: '/app/billing/dues', label: 'Dues', icon: Wallet },
  { to: '/app/billing/invoices', label: 'Invoices', icon: FileText },
  { to: '/app/billing/payments', label: 'Payments', icon: ReceiptIndianRupee },
  { to: '/app/billing/electricity', label: 'Electricity', icon: Zap },
  { to: '/app/expenses', label: 'Expenses', icon: WalletCards },
  { to: '/app/complaints', label: 'Complaints', icon: MessageSquareWarning },
  { to: '/app/notices', label: 'Notices', icon: Megaphone },
  { to: '/app/food-menu', label: 'Food menu', icon: UtensilsCrossed },
  { to: '/app/laundry', label: 'Laundry', icon: WashingMachine },
  { to: '/app/reports', label: 'Reports', icon: ClipboardList },
  { to: '/app/properties', label: 'Properties', icon: Building2 },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

const OWNER_TABS: NavItem[] = [
  { to: '/app/dashboard', label: 'Home', icon: Home },
  { to: '/app/bedmap', label: 'Beds', icon: BedDouble },
  { to: '/app/residents', label: 'Residents', icon: Users },
  { to: '/app/billing/dues', label: 'Money', icon: Wallet },
];

const RESIDENT_NAV: NavItem[] = [
  { to: '/me', label: 'Home', icon: Home, end: true },
  { to: '/me/games', label: 'Games', icon: Trophy },
  { to: '/me/laundry', label: 'Laundry', icon: WashingMachine },
  { to: '/me/payments', label: 'Payments', icon: CreditCard },
  { to: '/me/requests', label: 'Requests', icon: MessageSquareWarning },
  { to: '/me/profile', label: 'Profile', icon: User },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/admin/organizations', label: 'Organizations', icon: Building2 },
  { to: '/admin/kyc', label: 'KYC queue', icon: FileCheck2 },
  { to: '/admin/plans', label: 'Plans', icon: WalletCards },
  { to: '/admin/broadcasts', label: 'Broadcasts', icon: Radio },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

function Lazy() {
  return <Suspense fallback={<ListSkeleton />}><Outlet /></Suspense>;
}

function OwnerLayout() {
  const { me: user, loading, workspace } = useAuth();
  if (loading) return <ListSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (!workspace) return <Navigate to="/onboarding" replace />;
  if (workspace.role === 'resident') return <Navigate to="/me" replace />;
  if (workspace.orgStatus === 'pending') return <Suspense fallback={<ListSkeleton />}><PendingApproval /></Suspense>;
  return (
    <PropertyProvider>
      <AppShell nav={OWNER_NAV} tabs={OWNER_TABS} title={workspace.orgName} topbar={<PropertySwitcher />} />
    </PropertyProvider>
  );
}

function ResidentLayout() {
  const { me: user, loading, workspace } = useAuth();
  if (loading) return <ListSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (workspace && workspace.role !== 'resident') return <Navigate to={homeOf(workspace)} replace />;
  return <AppShell nav={RESIDENT_NAV} tabs={RESIDENT_NAV.slice(0, 4)} title={workspace?.orgName} />;
}

function AdminLayout() {
  const { me: user, loading } = useAuth();
  if (loading) return <ListSkeleton />;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!user.isSuperAdmin) return <Navigate to="/" replace />;
  return <AppShell nav={ADMIN_NAV} tabs={ADMIN_NAV.slice(0, 4)} title="Roomora Admin" />;
}

function Root() {
  const { me: user, loading, workspace } = useAuth();
  if (loading) return <ListSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.isSuperAdmin ? '/admin' : homeOf(workspace)} replace />;
}

function NotFound() {
  return (
    <main className="p-8 text-center">
      <h1 className="mb-3 text-2xl font-bold">Page not found</h1>
      <Link to="/"><Button>Go home</Button></Link>
    </main>
  );
}

function RouteError() {
  return <ErrorState error={useRouteError() as Error} onRetry={() => location.reload()} />;
}

const Dashboard = owner.dashboard;
const Bedmap = owner.bedmap;
const Onboarding = owner.onboarding;

export const router = createBrowserRouter([
  { path: '/', element: <Root /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <LoginPage key="register" register /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  { path: '/select-workspace', element: <SelectWorkspacePage /> },
  { path: '/invite/:code', element: <InvitePage /> },
  { path: '/onboarding', element: <Suspense fallback={<ListSkeleton />}><Onboarding /></Suspense>, errorElement: <RouteError /> },
  {
    path: '/app',
    element: <OwnerLayout />,
    errorElement: <RouteError />,
    children: [{
      element: <Lazy />,
      children: [
        { index: true, element: <Navigate to="dashboard" replace /> },
        { path: 'dashboard', element: <Dashboard /> },
        { path: 'bedmap', element: <Bedmap /> },
        { path: 'properties', Component: named(props, 'PropertiesPage') },
        { path: 'properties/new', Component: named(props, 'NewPropertyPage') },
        { path: 'properties/:id', Component: named(props, 'PropertyDetailPage') },
        { path: 'residents', Component: named(residents, 'ResidentsPage') },
        { path: 'residents/new', Component: named(residents, 'AddResidentPage') },
        { path: 'residents/:stayId', Component: named(residents, 'ResidentDetailPage') },
        { path: 'billing/dues', Component: named(billing, 'DuesPage') },
        { path: 'billing/invoices', Component: named(billing, 'InvoicesPage') },
        { path: 'billing/payments', Component: named(billing, 'PaymentsPage') },
        { path: 'billing/electricity', Component: named(billing, 'ElectricityPage') },
        { path: 'expenses', Component: named(ops, 'ExpensesPage') },
        { path: 'complaints', Component: named(ops, 'ComplaintsPage') },
        { path: 'notices', Component: named(ops, 'NoticesPage') },
        { path: 'food-menu', Component: named(ops, 'FoodMenuPage') },
        { path: 'laundry', Component: named(laundry, 'OwnerLaundryPage') },
        { path: 'rooms/:roomId/design', Component: named(rooms, 'RoomDesignPage') },
        { path: 'reports', Component: named(ops, 'ReportsPage') },
        { path: 'settings', Component: named(ops, 'SettingsPage') },
      ],
    }],
  },
  {
    path: '/me',
    element: <ResidentLayout />,
    errorElement: <RouteError />,
    children: [{
      element: <Lazy />,
      children: [
        { index: true, Component: named(me, 'HomePage') },
        { path: 'payments', Component: named(me, 'PaymentsPage') },
        { path: 'games', Component: named(community, 'GamesPage') },
        { path: 'games/:id', Component: named(community, 'GameChatPage') },
        { path: 'laundry', Component: named(laundry, 'ResidentLaundryPage') },
        { path: 'room', Component: named(rooms, 'MyRoomPage') },
        { path: 'requests', Component: named(me, 'RequestsPage') },
        { path: 'notices', Component: named(me, 'NoticesPage') },
        { path: 'menu', Component: named(me, 'MenuPage') },
        { path: 'profile', Component: named(me, 'ProfilePage') },
      ],
    }],
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    errorElement: <RouteError />,
    children: [{
      element: <Lazy />,
      children: [
        { index: true, Component: named(admin, 'AdminDashboardPage') },
        { path: 'organizations', Component: named(admin, 'OrganizationsPage') },
        { path: 'organizations/:id', Component: named(admin, 'OrganizationDetailPage') },
        { path: 'kyc', Component: named(admin, 'KycQueuePage') },
        { path: 'plans', Component: named(admin, 'PlansPage') },
        { path: 'broadcasts', Component: named(admin, 'BroadcastsPage') },
        { path: 'audit', Component: named(admin, 'AuditPage') },
      ],
    }],
  },
  { path: '*', element: <NotFound /> },
]);
