import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import {
  computeSummary,
  SummaryResult,
  SummaryRow,
  HospitalMonthly,
} from '../utils/summary';
import { formatYen } from '../utils/format';

// YYYY-MM → "YYYY年M月"
function monthLabel(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  return `${m[1]}年${Number(m[2])}月`;
}

function Section({
  title,
  rows,
  labelOf,
}: {
  title: string;
  rows: SummaryRow[];
  labelOf?: (key: string) => string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>データがありません。</Text>
      ) : (
        rows.map(row => (
          <View key={row.key} style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowKey} numberOfLines={1}>
                {labelOf ? labelOf(row.key) : row.key}
              </Text>
              <Text style={styles.rowCount}>{row.count}件</Text>
            </View>
            <Text style={styles.rowTotal}>{formatYen(String(row.total))}</Text>
          </View>
        ))
      )}
    </View>
  );
}

// 病院ごとの月別内訳（タップで開閉）
function HospitalMonthlySection({ rows }: { rows: HospitalMonthly[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>病院別（月別内訳）</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>データがありません。</Text>
      ) : (
        rows.map(h => {
          const open = !!expanded[h.hospital];
          return (
            <View key={h.hospital} style={styles.group}>
              <TouchableOpacity
                style={styles.row}
                onPress={() =>
                  setExpanded(e => ({ ...e, [h.hospital]: !e[h.hospital] }))
                }>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowKey} numberOfLines={1}>
                    {open ? '▼ ' : '▶ '}
                    {h.hospital}
                  </Text>
                  <Text style={styles.rowCount}>{h.count}件</Text>
                </View>
                <Text style={styles.rowTotal}>{formatYen(String(h.total))}</Text>
              </TouchableOpacity>
              {open &&
                h.months.map(m => (
                  <View key={m.key} style={styles.subRow}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.subKey}>{monthLabel(m.key)}</Text>
                      <Text style={styles.rowCount}>{m.count}件</Text>
                    </View>
                    <Text style={styles.subTotal}>
                      {formatYen(String(m.total))}
                    </Text>
                  </View>
                ))}
            </View>
          );
        })
      )}
    </View>
  );
}

export function SummaryScreen() {
  const [data, setData] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await computeSummary());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // 今月（受注日ベース）の合計・件数
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = data?.byMonth.find(m => m.key === thisMonthKey);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>今月の金額（{monthLabel(thisMonthKey)}）</Text>
        <Text style={styles.totalValue}>
          {formatYen(String(thisMonth?.total ?? 0)) || '¥0'}
        </Text>
        <Text style={styles.totalCount}>{thisMonth?.count ?? 0}件</Text>
      </View>

      <Section
        title="月別（受注日）"
        rows={data?.byMonth ?? []}
        labelOf={monthLabel}
      />
      <HospitalMonthlySection rows={data?.byHospitalMonth ?? []} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  totalCard: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  totalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  totalValue: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 4 },
  totalCount: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  empty: { fontSize: 14, color: '#999', paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowLeft: { flex: 1, marginRight: 12 },
  rowKey: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowCount: { fontSize: 12, color: '#888', marginTop: 2 },
  rowTotal: { fontSize: 16, fontWeight: '700', color: '#111' },
  group: { marginBottom: 8 },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderLeftWidth: 2,
    borderLeftColor: '#c7d2e0',
    marginLeft: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  subKey: { fontSize: 14, color: '#333' },
  subTotal: { fontSize: 14, fontWeight: '600', color: '#333' },
});
