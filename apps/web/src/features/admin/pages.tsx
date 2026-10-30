import { Building2, BedDouble, CircleDollarSign, FileCheck2, IndianRupee, Percent } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Button, Card, CardTitle, DataList, EmptyState, Field, FileThumb, FormError, Input, Money, PageHeader, Pagination, Query, Select, Sheet, StatCard, StatusBadge, Textarea } from '../../components/ui';
import { api, useGet, useGetPage, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { mapLink } from '../properties/location';
import { displayPhone, formatDate, formatINR, rupeesToPaise } from '../../lib/format';

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const query = useGet<any>('/admin/dashboard');
  return (
    <>
      <PageHeader title={t('Platform dashboard')} />
      <Query query={query}>
        {(d) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatCard icon={Building2} label={t('Organizations')} value={d.orgs.total} hint={t('{{active}} active · {{trial}} trial · {{pending}} waiting', { active: d.orgs.active, trial: d.orgs.trial, pending: d.orgs.pending })} to="/admin/organizations" />
              <StatCard icon={BedDouble} label={t('PGs / beds')} value={`${d.properties} / ${d.beds}`} />
              <StatCard icon={Percent} label={t('Occupancy')} value={`${d.occupancyPct}%`} />
              <StatCard icon={IndianRupee} label={t('Rent GMV')} value={formatINR(d.rentGmvPaise)} />
              <StatCard icon={CircleDollarSign} label={t('MRR')} value={formatINR(d.mrrPaise)} />
              <StatCard icon={FileCheck2} label={t('Pending KYC')} value={d.pendingKyc} to="/admin/kyc" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardTitle>{t('Latest signups')}</CardTitle>
                <ul className="space-y-2">{d.latestSignups.map((o: any) => <li key={o._id} className="flex justify-between gap-2"><span className="truncate">{o.name}</span><StatusBadge kind="org" status={o.status} /></li>)}</ul>
              </Card>
              <Card>
                <CardTitle>{t('Trials ending in 3 days')}</CardTitle>
                {d.trialsEnding.length ? <ul className="space-y-2">{d.trialsEnding.map((o: any) => <li key={o._id} className="flex justify-between gap-2"><span>{o.name}</span><span className="text-text-muted">{formatDate(o.trialEndsAt)}</span></li>)}</ul> : <p className="text-text-muted">{t('None.')}</p>}
              </Card>
            </div>
          </div>
        )}
      </Query>
    </>
  );
}

export function OrganizationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), ...(q && { q }), ...(status && { status }) });
  const query = useGetPage<any>(`/admin/orgs?${params}`);
  return (
    <>
      <PageHeader title={t('Organizations')} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-sm" aria-label={t('Search')} placeholder={t('Search name')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select aria-label={t('Status')} className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('All statuses')}</option>
          {['pending', 'trial', 'active', 'read_only', 'suspended'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </Select>
      </div>
      <Query query={query}>
        {({ items, meta }) =>
          items.length === 0 ? <EmptyState title={t('No organizations')} /> : (
            <>
              <DataList
                rows={items}
                rowKey={(o) => o._id}
                onRow={(o) => navigate(`/admin/organizations/${o._id}`)}
                columns={[
                  { header: t('Name'), cell: (o) => o.name },
                  { header: t('City'), cell: (o) => o.city },
                  { header: t('Status'), cell: (o) => <StatusBadge kind="org" status={o.status} /> },
                  { header: t('KYC'), cell: (o) => <StatusBadge kind="kyc" status={o.kyc?.status} /> },
                  { header: t('Created'), cell: (o) => formatDate(o.createdAt) },
                ]}
                mobile={(o) => <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{o.name}</span><StatusBadge kind="org" status={o.status} /></div>}
              />
              <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />
            </>
          )
        }
      </Query>
    </>
  );
}

function ReasonSheet({ title, action, open, onClose, onSubmit, error, loading }: { title: string; action: string; open: boolean; onClose: () => void; onSubmit: (reason: string) => void; error?: Error | null; loading?: boolean }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <Field label={t('Reason (required)')}><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <FormError error={error} />
        <Button variant="danger" block disabled={reason.trim().length < 3} loading={loading} onClick={() => onSubmit(reason)}>{action}</Button>
      </div>
    </Sheet>
  );
}

export function OrganizationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const query = useGet<any>(`/admin/orgs/${id}`);
  const plans = useGet<any[]>('/admin/plans');
  const status = useSend('post', `/admin/orgs/${id}/status`);
  const subscription = useSend('post', `/admin/orgs/${id}/subscription`);
  const [sheet, setSheet] = useState<'suspend' | 'impersonate' | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function impersonate(reason: string, userId: string) {
    setBusy(true);
    setError(null);
    try {
      const { accessToken } = await api.post<{ accessToken: string }>('/admin/impersonate', { userId, reason });
      await signIn(accessToken);
      navigate('/app/dashboard');
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Query query={query}>
      {({ org, plan, usage, users, properties }) => {
        const suspended = org.status === 'suspended';
        const owner = users.find((u: any) => u.role === 'owner');
        return (
          <>
            <PageHeader
              title={org.name}
              subtitle={`${org.city}, ${org.state}`}
              actions={
                <>
                  <Button variant="secondary" disabled={!owner} onClick={() => setSheet('impersonate')}>{t('Impersonate')}</Button>
                  {suspended ? <Button loading={status.isPending} onClick={() => status.mutate({ status: 'active', reason: 'Reactivated by admin' })}>{t('Reactivate')}</Button> : <Button variant="danger" onClick={() => setSheet('suspend')}>{t('Suspend')}</Button>}
                </>
              }
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardTitle action={<StatusBadge kind="org" status={org.status} />}>{t('Usage against plan')}</CardTitle>
                <dl className="grid grid-cols-2 gap-1">
                  <dt>{t('PGs')}</dt><dd className="tabular text-right">{usage.properties} / {plan?.limits?.properties}</dd>
                  <dt>{t('Beds')}</dt><dd className="tabular text-right">{usage.beds} / {plan?.limits?.beds}</dd>
                </dl>
              </Card>
              <Card>
                <CardTitle>{t('Subscription')}</CardTitle>
                <FormError error={subscription.error} />
                <div className="space-y-3">
                  <Field label={t('Plan')}>
                    <Select value={plan?.code ?? ''} onChange={(e) => subscription.mutate({ planCode: e.target.value })}>
                      {plans.data?.map((p) => <option key={p._id} value={p.code}>{p.name}</option>)}
                    </Select>
                  </Field>
                  <Button variant="secondary" onClick={() => subscription.mutate({ extendTrialDays: 7 })}>{t('Extend trial by 7 days')}</Button>
                </div>
              </Card>
              <Card>
                <CardTitle>{t('Owner')}</CardTitle>
                <ul className="space-y-2">{users.map((u: any) => <li key={u._id} className="flex justify-between gap-2"><span>{u.user?.name || displayPhone(u.user?.phone)}</span><span className="capitalize text-text-muted">{t(u.role)}</span></li>)}</ul>
              </Card>
              <Card>
                <CardTitle>{t('PGs')}</CardTitle>
                <ul className="space-y-2">{properties.map((p: any) => <li key={p._id}>{p.name}</li>)}</ul>
              </Card>
            </div>
            <ReasonSheet open={sheet === 'suspend'} onClose={() => setSheet(null)} title={t('Suspend organization')} action={t('Suspend')} loading={status.isPending} error={status.error} onSubmit={(reason) => status.mutate({ status: 'suspended', reason }, { onSuccess: () => setSheet(null) })} />
            <ReasonSheet open={sheet === 'impersonate'} onClose={() => setSheet(null)} title={t('Impersonate owner')} action={t('Impersonate')} loading={busy} error={error} onSubmit={(reason) => void impersonate(reason, String(owner.userId))} />
          </>
        );
      }}
    </Query>
  );
}

const DOC_LABELS: Record<string, string> = { owner_id: 'Owner ID proof', property_proof: 'Property proof', pg_photo: 'PG photos', gst_certificate: 'GST certificate' };

function KycReview({ org, onDone }: { org: any; onDone: () => void }) {
  const { t } = useTranslation();
  const detail = useGet<any>(`/admin/orgs/${org._id}`);
  const decide = useSend<{ decision: string; reason?: string }>('post', `/admin/orgs/${org._id}/kyc`);
  const [comment, setComment] = useState('');
  const owner = detail.data?.users.find((u: any) => u.role === 'owner')?.user;
  const docs: { type: string; key: string }[] = org.kyc.docs;
  const photo = docs.find((d) => d.type === 'owner_photo');
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-20 shrink-0">{photo ? <FileThumb fileKey={photo.key} alt={t('Owner photo')} /> : <div className="aspect-square rounded-md bg-surface-muted" />}</div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{owner?.name || t('Owner')}</h2>
          <p className="text-text-muted">{displayPhone(owner?.phone)}</p>
          {owner?.email && <p className="truncate text-text-muted">{owner.email}</p>}
        </div>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-text-muted">{t('PG')}</dt><dd>{org.name}</dd></div>
        <div><dt className="text-text-muted">{t('Type')}</dt><dd className="capitalize">{t(org.type)}</dd></div>
        <div><dt className="text-text-muted">{t('GSTIN')}</dt><dd>{org.gstin || '—'}</dd></div>
        <div className="sm:col-span-3"><dt className="text-text-muted">{t('Address')}</dt><dd>{detail.data?.properties.map((p: any) => {
          const link = mapLink(p.address?.geo);
          return <span key={p._id} className="block">{[p.address?.line1, p.address?.city, p.address?.state, p.address?.pincode].filter(Boolean).join(', ')} {link && <a href={link} target="_blank" rel="noreferrer" className="text-primary">{t('View on map')}</a>}</span>;
        })}</dd></div>
      </dl>
      {Object.keys(DOC_LABELS).map((type) => {
        const files = docs.filter((d) => d.type === type);
        return files.length > 0 && (
          <div key={type}>
            <p className="mb-1 text-xs font-medium text-text-muted">{t(DOC_LABELS[type])}</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{files.map((d, i) => <FileThumb key={d.key} fileKey={d.key} alt={`${t(DOC_LABELS[type])} ${i + 1}`} />)}</div>
          </div>
        );
      })}
      {org.kyc.history?.length > 0 && (
        <ol className="space-y-1 border-t border-border pt-2 text-xs text-text-muted">
          {org.kyc.history.map((h: any, i: number) => <li key={i}>{formatDate(h.at)}: {t(h.action)}{h.comment ? ` · ${h.comment}` : ''}</li>)}
        </ol>
      )}
      <Field label={t('Comments for the owner')} hint={t('Needed when sending back.')}><Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <FormError error={decide.error} />
      <div className="flex flex-wrap gap-2">
        <Button loading={decide.isPending} onClick={() => decide.mutate({ decision: 'approve' }, { onSuccess: onDone })}>{t('Approve')}</Button>
        <Button variant="secondary" disabled={comment.trim().length < 3} onClick={() => decide.mutate({ decision: 'reject', reason: comment }, { onSuccess: onDone })}>{t('Send back with comments')}</Button>
      </div>
    </Card>
  );
}

export function KycQueuePage() {
  const { t } = useTranslation();
  const query = useGetPage<any>('/admin/orgs?kyc=pending_review&limit=100');
  const [selected, setSelected] = useState<any>(null);
  return (
    <>
      <PageHeader title={t('KYC queue')} />
      <Query query={query}>
        {({ items }) =>
          items.length === 0 ? <EmptyState title={t('Queue is clear')} /> : (
            <div className="grid gap-4 md:grid-cols-[280px_1fr]">
              <ul className="space-y-2">
                {items.map((org) => <li key={org._id}><button type="button" onClick={() => setSelected(org)} className={`min-h-11 w-full rounded-md border p-3 text-left ${selected?._id === org._id ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}>{org.name}</button></li>)}
              </ul>
              {selected ? (
                <KycReview key={selected._id} org={selected} onDone={() => setSelected(null)} />
              ) : <EmptyState title={t('Choose an organization')} />}
            </div>
          )
        }
      </Query>
    </>
  );
}

export function PlansPage() {
  const { t } = useTranslation();
  const query = useGet<any[]>('/admin/plans');
  const [editing, setEditing] = useState<any>(null);
  const save = useSend('patch', () => `/admin/plans/${editing?._id}`);
  return (
    <>
      <PageHeader title={t('Plans')} />
      <Query query={query}>
        {(plans) => (
          <DataList
            rows={plans}
            rowKey={(p) => p._id}
            onRow={(p) => setEditing({ ...p, price: String(p.priceMonthlyPaise / 100) })}
            columns={[
              { header: t('Name'), cell: (p) => p.name },
              { header: t('Monthly'), align: 'right', cell: (p) => <Money paise={p.priceMonthlyPaise} /> },
              { header: t('PGs'), cell: (p) => p.limits.properties },
              { header: t('Beds'), cell: (p) => p.limits.beds },
            ]}
            mobile={(p) => <div className="flex justify-between gap-2"><span>{p.name}</span><Money paise={p.priceMonthlyPaise} /></div>}
          />
        )}
      </Query>
      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.name ?? ''}>
        {editing && (
          <div className="space-y-3">
            <Field label={t('Monthly price (₹)')}><Input inputMode="numeric" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></Field>
            <FormError error={save.error} />
            <Button block loading={save.isPending} onClick={() => save.mutate({ priceMonthlyPaise: rupeesToPaise(editing.price) }, { onSuccess: () => setEditing(null) })}>{t('Save')}</Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

export function BroadcastsPage() {
  const { t } = useTranslation();
  const query = useGet<any[]>('/admin/broadcasts');
  const [form, setForm] = useState({ title: '', body: '' });
  const save = useSend('post', '/admin/broadcasts');
  return (
    <>
      <PageHeader title={t('Broadcasts')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <Field label={t('Title')}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label={t('Message')}><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <FormError error={save.error} />
          <Button loading={save.isPending} onClick={() => save.mutate(form, { onSuccess: () => setForm({ title: '', body: '' }) })}>{t('Send to all owners')}</Button>
        </Card>
        <Query query={query}>
          {(rows) => (rows.length === 0 ? <EmptyState title={t('No broadcasts yet')} /> : <div className="space-y-2">{rows.map((b) => <Card key={b._id}><p className="font-semibold">{b.title}</p><p className="text-text-muted">{b.body}</p></Card>)}</div>)}
        </Query>
      </div>
    </>
  );
}

export function AuditPage() {
  const { t } = useTranslation();
  const query = useGet<any[]>('/admin/audit-logs');
  return (
    <>
      <PageHeader title={t('Audit log')} />
      <Query query={query}>
        {(rows) =>
          rows.length === 0 ? <EmptyState title={t('Nothing logged yet')} /> : (
            <DataList
              rows={rows}
              rowKey={(r) => r._id}
              columns={[
                { header: t('When'), cell: (r) => formatDate(r.createdAt) },
                { header: t('Action'), cell: (r) => r.action },
                { header: t('Target'), cell: (r) => r.targetType ?? '—' },
                { header: t('Details'), cell: (r) => r.meta?.reason ?? '—' },
              ]}
              mobile={(r) => <div className="flex justify-between gap-2"><span className="truncate">{r.action}</span><span className="text-text-muted">{formatDate(r.createdAt)}</span></div>}
            />
          )
        }
      </Query>
    </>
  );
}
