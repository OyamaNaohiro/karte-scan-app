import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { queryRecords, getHospitalNames, SortKey } from '../utils/db';
import { SavedRecord } from '../types';
import { DateField } from './DateField';
import { formatYen } from '../utils/format';

interface Props {
  onSelect: (record: SavedRecord) => void;
  onOpenSummary: () => void;
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'createdAt', label: '保存日' },
  { key: 'orderDate', label: '受注日' },
  { key: 'deliveryDate', label: '納品日' },
  { key: 'patientName', label: '氏名' },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function RecordList({ onSelect, onOpenSummary }: Props) {
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // 検索・絞り込み・ソート条件
  const [search, setSearch] = useState('');
  const [hospital, setHospital] = useState('');
  const [orderFrom, setOrderFrom] = useState('');
  const [orderTo, setOrderTo] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await queryRecords({
        search,
        hospital: hospital || undefined,
        orderFrom: orderFrom || undefined,
        orderTo: orderTo || undefined,
        sortBy,
        sortDir,
      });
      setRecords(rows);
    } finally {
      setLoading(false);
    }
  }, [search, hospital, orderFrom, orderTo, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getHospitalNames()
      .then(setHospitals)
      .catch(() => setHospitals([]));
  }, []);

  const hasFilter = !!(hospital || orderFrom || orderTo);

  function clearFilters() {
    setHospital('');
    setOrderFrom('');
    setOrderTo('');
  }

  const header = (
    <View style={styles.controls}>
      <TouchableOpacity style={styles.summaryBtn} onPress={onOpenSummary}>
        <Text style={styles.summaryBtnText}>📊 金額の集計を見る</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="氏名・病院名・病名などで検索"
        placeholderTextColor="#999"
        clearButtonMode="while-editing"
      />

      {/* ソート */}
      <View style={styles.sortRow}>
        <View style={styles.sortChips}>
          {SORT_OPTIONS.map(o => (
            <TouchableOpacity
              key={o.key}
              style={[styles.sortChip, sortBy === o.key && styles.sortChipOn]}
              onPress={() => setSortBy(o.key)}>
              <Text
                style={[
                  styles.sortChipText,
                  sortBy === o.key && styles.sortChipTextOn,
                ]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.dirBtn}
          onPress={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}>
          <Text style={styles.dirText}>{sortDir === 'asc' ? '▲ 昇順' : '▼ 降順'}</Text>
        </TouchableOpacity>
      </View>

      {/* 絞り込みトグル */}
      <TouchableOpacity
        style={styles.filterToggle}
        onPress={() => setShowFilters(v => !v)}>
        <Text style={styles.filterToggleText}>
          {showFilters ? '▲ 絞り込みを閉じる' : '▼ 絞り込み'}
          {hasFilter ? '（適用中）' : ''}
        </Text>
      </TouchableOpacity>

      {showFilters && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterLabel}>病院名</Text>
          <View style={styles.hospChips}>
            <TouchableOpacity
              style={[styles.hospChip, !hospital && styles.hospChipOn]}
              onPress={() => setHospital('')}>
              <Text style={[styles.hospChipText, !hospital && styles.hospChipTextOn]}>
                すべて
              </Text>
            </TouchableOpacity>
            {hospitals.map((h, i) => (
              <TouchableOpacity
                key={`h-${i}`}
                style={[styles.hospChip, hospital === h && styles.hospChipOn]}
                onPress={() => setHospital(hospital === h ? '' : h)}>
                <Text
                  style={[styles.hospChipText, hospital === h && styles.hospChipTextOn]}
                  numberOfLines={1}>
                  {h}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterLabel}>受注日（範囲）</Text>
          <View style={styles.rangeRow}>
            <View style={styles.rangeCol}>
              <Text style={styles.rangeCap}>から</Text>
              <DateField value={orderFrom} onChange={setOrderFrom} />
            </View>
            <View style={styles.rangeCol}>
              <Text style={styles.rangeCap}>まで</Text>
              <DateField value={orderTo} onChange={setOrderTo} />
            </View>
          </View>

          {hasFilter && (
            <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
              <Text style={styles.clearText}>絞り込みをクリア</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.count}>{records.length}件</Text>
    </View>
  );

  return (
    <FlatList
      data={records}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} size="large" color="#2563EB" />
        ) : (
          <Text style={styles.empty}>該当する記録はありません。</Text>
        )
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
            <Text style={styles.rowDate}>
              {item.karteData.orderDate ? `受注 ${item.karteData.orderDate}　` : ''}
              保存 {formatDateTime(item.createdAt)}
            </Text>
          </View>
          {!!item.karteData.price && (
            <Text style={styles.rowPrice}>{formatYen(item.karteData.price)}</Text>
          )}
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 16 },
  controls: { marginBottom: 8 },
  summaryBtn: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryBtnText: { color: '#2563EB', fontSize: 15, fontWeight: '700' },
  rowPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginLeft: 8,
  },
  search: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sortChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  sortChip: {
    borderWidth: 1,
    borderColor: '#d0d7e2',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  sortChipOn: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  sortChipText: { fontSize: 13, color: '#555' },
  sortChipTextOn: { color: '#fff', fontWeight: '700' },
  dirBtn: { paddingHorizontal: 8, paddingVertical: 5, marginLeft: 8 },
  dirText: { fontSize: 13, color: '#2563EB', fontWeight: '600' },
  filterToggle: { marginTop: 12, paddingVertical: 6 },
  filterToggleText: { fontSize: 14, color: '#2563EB', fontWeight: '600' },
  filterPanel: {
    backgroundColor: '#f7f9fc',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginBottom: 6,
    marginTop: 4,
  },
  hospChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hospChip: {
    borderWidth: 1,
    borderColor: '#c7d2e0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#fff',
    maxWidth: '100%',
  },
  hospChipOn: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  hospChipText: { fontSize: 13, color: '#444' },
  hospChipTextOn: { color: '#fff', fontWeight: '700' },
  rangeRow: { flexDirection: 'row', gap: 10 },
  rangeCol: { flex: 1 },
  rangeCap: { fontSize: 11, color: '#888', marginBottom: 4 },
  clearBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  clearText: { color: '#dc2626', fontSize: 13, fontWeight: '600' },
  count: { fontSize: 12, color: '#999', marginTop: 12 },
  empty: { fontSize: 15, color: '#888', textAlign: 'center', marginTop: 32 },
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
