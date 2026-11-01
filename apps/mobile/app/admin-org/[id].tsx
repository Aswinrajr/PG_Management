import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, View } from 'react-native';
import { api, API_ORIGIN, useGet, useSend } from '@/lib/api';
import { Badge, Button, Card, ErrorText, Field, Page, Query, Row, T, useTheme } from '@/lib/ui';

const LABELS: Record<string, string> = { owner_photo: 'Owner photo', owner_id: 'Owner ID proof', property_proof: 'Property proof', pg_photo: 'PG photos', gst_certificate: 'GST certificate' };

/** Files are protected, so the image request carries the login token. */
function useImageSource(fileKey: string) {
  const [webUrl, setWebUrl] = useState<string>();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    void api.blob(`/files/${fileKey}`).then((blob) => setWebUrl(URL.createObjectURL(blob))).catch(() => undefined);
  }, [fileKey]);
  if (Platform.OS === 'web') return webUrl ? { uri: webUrl } : undefined;
  return { uri: `${API_ORIGIN}/api/v1/files/${fileKey}`, headers: { Authorization: `Bearer ${api.getToken()}` } };
}

function Doc({ fileKey, label }: { fileKey: string; label: string }) {
  const c = useTheme();
  const source = useImageSource(fileKey);
  const [open, setOpen] = useState(false);
  const pdf = fileKey.endsWith('.pdf');
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${label}`} disabled={pdf} onPress={() => setOpen(true)} style={{ width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
        {pdf ? <FileText size={28} color={c.textMuted} /> : source && <Image source={source} style={{ width: 84, height: 84 }} />}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close preview" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.92)', justifyContent: 'center', padding: 16 }}>
          {source && <Image source={source} resizeMode="contain" style={{ width: '100%', height: '80%' }} />}
        </Pressable>
      </Modal>
    </>
  );
}

export default function AdminOrg() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useGet<any>(`/admin/orgs/${id}`);
  const decide = useSend('post', `/admin/orgs/${id}/kyc`);
  const status = useSend('post', `/admin/orgs/${id}/status`);
  const [comment, setComment] = useState('');
  const done = () => router.back();
  return (
    <Page title="Review" bell={false} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Query query={query}>
        {({ org, users, properties, usage }) => {
          const owner = users.find((u: any) => u.role === 'owner')?.user;
          const types = Object.keys(LABELS).filter((type) => org.kyc?.docs?.some((d: any) => d.type === type));
          const reviewing = org.kyc?.status === 'pending_review';
          const suspended = org.status === 'suspended';
          return (
            <>
              <Card>
                <Row><T size={18} weight="800">{org.name}</T><Badge status={org.status} /></Row>
                <T muted>{org.city}, {org.state}</T>
                <T size={12} muted>{usage.properties} PGs · {usage.beds} beds{org.gstin ? ` · GSTIN ${org.gstin}` : ''}</T>
              </Card>
              <Card>
                <T weight="700">Owner</T>
                <T>{owner?.name || 'Not given'}</T>
                {owner?.phone && <T muted>+{owner.phone}</T>}
                {owner?.email && <T muted>{owner.email}</T>}
              </Card>
              {properties.map((p: any) => (
                <Card key={p._id}>
                  <T weight="700">{p.name}</T>
                  <T muted>{[p.address?.line1, p.address?.city, p.address?.state, p.address?.pincode].filter(Boolean).join(', ')}</T>
                  {p.address?.geo?.lat != null && <Button title="View on map" variant="secondary" onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${p.address.geo.lat},${p.address.geo.lng}`)} />}
                </Card>
              ))}
              {types.map((type) => (
                <Card key={type}>
                  <T weight="700">{LABELS[type]}</T>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {org.kyc.docs.filter((d: any) => d.type === type).map((d: any, i: number) => <Doc key={d.key} fileKey={d.key} label={`${LABELS[type]} ${i + 1}`} />)}
                  </View>
                </Card>
              ))}
              {reviewing && (
                <Card>
                  <View style={{ gap: 10 }}>
                    <Field label="Comments for the owner" hint="Needed when sending back." multiline value={comment} onChangeText={setComment} />
                    <ErrorText error={decide.error} />
                    <Button title="Approve" loading={decide.isPending} onPress={() => decide.mutate({ decision: 'approve' }, { onSuccess: done })} />
                    <Button title="Send back with comments" variant="secondary" disabled={comment.trim().length < 3} onPress={() => decide.mutate({ decision: 'reject', reason: comment }, { onSuccess: done })} />
                  </View>
                </Card>
              )}
              {!reviewing && org.status !== 'pending' && (
                <Card>
                  <View style={{ gap: 10 }}>
                    <Field label="Reason" hint="Needed to suspend. Kept in the audit log." value={comment} onChangeText={setComment} />
                    <ErrorText error={status.error} />
                    {suspended
                      ? <Button title="Reactivate" loading={status.isPending} onPress={() => status.mutate({ status: 'active', reason: comment.trim() || 'Reactivated by admin' }, { onSuccess: done })} />
                      : <Button title="Suspend" variant="danger" loading={status.isPending} disabled={comment.trim().length < 3} onPress={() => status.mutate({ status: 'suspended', reason: comment }, { onSuccess: done })} />}
                  </View>
                </Card>
              )}
            </>
          );
        }}
      </Query>
      <Button title="Back" variant="secondary" onPress={done} />
    </Page>
  );
}
