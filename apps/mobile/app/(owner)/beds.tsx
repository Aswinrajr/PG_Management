import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Empty, Page, Query, T, useTheme } from '@/lib/ui';

const tone = (c: Record<string, string>, status: string) =>
  ({ vacant: c.neutralText, reserved: c.infoText, occupied: c.successText, notice: c.warningText, maintenance: c.dangerText })[status] ?? c.neutralText;

export default function Beds() {
  const { orgPath } = useAuth();
  const c = useTheme() as Record<string, string>;
  const properties = useGet<any[]>(orgPath('/properties'));
  const [index, setIndex] = useState(0);
  const property = properties.data?.[index];
  const map = useGet<any>(property ? orgPath(`/properties/${property._id}/bedmap`) : null);
  return (
    <Page title="Beds" subtitle={property?.name} onRefresh={() => void map.refetch()} refreshing={map.isRefetching}>
      {(properties.data?.length ?? 0) > 1 && <Button title="Next PG" variant="secondary" onPress={() => setIndex((index + 1) % properties.data!.length)} />}
      {properties.data?.length === 0 && <Empty title="No PGs yet" />}
      {property && (
        <Query query={map}>
          {(data) =>
            data.summary.total === 0 ? <Empty title="No rooms yet" text="Add rooms on the Roomora website." /> : (
              <>
                <T muted>{data.summary.vacant} vacant · {data.summary.occupied} occupied · {data.summary.notice} on notice</T>
                {data.floors.map((floor: any) => (
                  <View key={floor.id} style={{ gap: 8 }}>
                    <T weight="600">{floor.label}</T>
                    {floor.rooms.map((room: any) => (
                      <Card key={room.id}>
                        <T weight="600">{room.number}{room.isAc ? ' · AC' : ''}</T>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                          {room.beds.map((bed: any) => (
                            <Pressable key={bed.id} accessibilityRole="button" accessibilityLabel={`Bed ${bed.label}, ${bed.status}`} style={{ width: 64, height: 64, borderRadius: 8, borderWidth: 2, borderColor: tone(c, bed.status), alignItems: 'center', justifyContent: 'center' }}>
                              <T weight="700" color={tone(c, bed.status)}>{bed.label}</T>
                              <T size={10} muted>{bed.status}</T>
                            </Pressable>
                          ))}
                        </View>
                      </Card>
                    ))}
                  </View>
                ))}
              </>
            )
          }
        </Query>
      )}
    </Page>
  );
}
