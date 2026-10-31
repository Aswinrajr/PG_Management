import { useGet } from '@/lib/api';
import { Badge, Card, Empty, Money, Page, Query, Row, T } from '@/lib/ui';

const day = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function Payments() {
  const invoices = useGet<any[]>('/me/invoices');
  const payments = useGet<any[]>('/me/payments');
  return (
    <Page title="Payments" subtitle="Online payment is coming to the app soon." onRefresh={() => void Promise.all([invoices.refetch(), payments.refetch()])} refreshing={invoices.isRefetching}>
      <Query query={invoices}>
        {(rows) =>
          rows.length === 0 ? <Empty title="No invoices yet" /> : (
            <>
              {[...rows].sort((a, b) => Number(b.balancePaise > 0) - Number(a.balancePaise > 0)).map((invoice) => (
                <Card key={invoice._id}>
                  <Row><T weight="600">{invoice.period ?? invoice.type}</T><Money paise={invoice.balancePaise || invoice.totalPaise} weight="600" /></Row>
                  <Row><T size={12} muted>Due {day(invoice.dueDate)}</T><Badge status={invoice.status} /></Row>
                </Card>
              ))}
            </>
          )
        }
      </Query>
      <T weight="600">Receipts</T>
      <Query query={payments}>
        {(rows) => (rows.length === 0 ? <T muted>No payments yet.</T> : <>{rows.map((p) => <Card key={p._id}><Row><T>{p.receiptNumber}</T><Money paise={p.amountPaise} /></Row><T size={12} muted>{day(p.paidAt)}</T></Card>)}</>)}
      </Query>
    </Page>
  );
}
