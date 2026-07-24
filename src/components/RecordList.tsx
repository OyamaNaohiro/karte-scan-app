import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { listRecords } from '../utils/fileStorage';
import { SavedRecord } from '../types';

interface Props {
  onSelect: (record: SavedRecord) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function RecordList({ onSelect }: Props) {
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await listRecords());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (records.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>保存済みの記録はありません。</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={records}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} />
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.row} onPress={() => onSelect(item)}>
          <View style={styles.rowMain}>
            <Text style={styles.rowName}>
              {item.karteData.patientName || '（氏名なし）'}
            </Text>
            {!!item.karteData.hospitalName && (
              <Text style={styles.rowSub} numberOfLines={1}>
                {item.karteData.hospitalName}
              </Text>
            )}
            <Text style={styles.rowDate}>{formatDate(item.createdAt)}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 15, color: '#888' },
  listContent: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '700', color: '#111' },
  rowSub: { fontSize: 13, color: '#666', marginTop: 2 },
  rowDate: { fontSize: 12, color: '#999', marginTop: 4 },
  chevron: { fontSize: 24, color: '#ccc', marginLeft: 8 },
});
