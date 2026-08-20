import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { getAllRecords } from '../utils/db';
import { isValidISODate } from '../utils/date';
import { buildWeeks, WEEKDAYS } from '../utils/calendar';
import { SavedRecord } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

interface Props {
  onSelectRecord: (record: SavedRecord) => void;
}

export function DeliveryCalendarScreen({ onSelectRecord }: Props) {
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllRecords();
      // 納品日が有効 かつ 受注日と異なるものだけをカレンダーに載せる
      setRecords(
        all.filter(
          r =>
            isValidISODate(r.karteData.deliveryDate) &&
            r.karteData.deliveryDate !== r.karteData.orderDate,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 納品日(ISO) → レコード配列
  const byDate = useMemo(() => {
    const map = new Map<string, SavedRecord[]>();
    for (const r of records) {
      const d = r.karteData.deliveryDate;
      const arr = map.get(d) ?? [];
      arr.push(r);
      map.set(d, arr);
    }
    return map;
  }, [records]);

  function shiftMonth(delta: number) {
    const m = viewMonth + delta;
    setViewYear(viewYear + Math.floor(m / 12));
    setViewMonth(((m % 12) + 12) % 12);
    setSelected('');
  }

  const weeks = buildWeeks(viewYear, viewMonth);
  const selectedList = selected ? byDate.get(selected) ?? [] : [];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.note}>
        受注日と異なる納品日の予定を表示します（{records.length}件）。
      </Text>

      {/* 年月ナビ */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => shiftMonth(-12)} style={styles.navBtn}>
          <Text style={styles.navText}>«</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>
          {viewYear}年 {viewMonth + 1}月
        </Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.navBtn}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftMonth(12)} style={styles.navBtn}>
          <Text style={styles.navText}>»</Text>
        </TouchableOpacity>
      </View>

      {/* 曜日 */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={w}
            style={[styles.weekCell, i === 0 && styles.sun, i === 6 && styles.sat]}>
            {w}
          </Text>
        ))}
      </View>

      {/* 日付グリッド */}
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((day, ci) => {
            if (day === null) {
              return <View key={ci} style={styles.dayCellWrap} />;
            }
            const iso = isoOf(viewYear, viewMonth, day);
            const count = byDate.get(iso)?.length ?? 0;
            const isSel = selected === iso;
            return (
              <View key={ci} style={styles.dayCellWrap}>
                <TouchableOpacity
                  style={[styles.dayCell, isSel && styles.daySelected]}
                  onPress={() => setSelected(iso)}>
                  <Text
                    style={[
                      styles.dayText,
                      ci === 0 && styles.sun,
                      ci === 6 && styles.sat,
                      isSel && styles.daySelectedText,
                    ]}>
                    {day}
                  </Text>
                  {count > 0 && (
                    <View style={[styles.badge, isSel && styles.badgeSel]}>
                      <Text style={styles.badgeText}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ))}

      {/* 選択日の納品一覧 */}
      <View style={styles.listSection}>
        {selected ? (
          selectedList.length > 0 ? (
            <>
              <Text style={styles.listTitle}>{selected} の納品</Text>
              {selectedList.map(r => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.recordRow}
                  onPress={() => onSelectRecord(r)}>
                  <View style={styles.flex}>
                    <Text style={styles.recordName}>
                      {r.karteData.patientName || '（氏名なし）'}
                    </Text>
                    {!!r.karteData.hospitalName && (
                      <Text style={styles.recordSub} numberOfLines={1}>
                        {r.karteData.hospitalName}
                      </Text>
                    )}
                    <Text style={styles.recordSub}>
                      受注 {r.karteData.orderDate || '—'} → 納品{' '}
                      {r.karteData.deliveryDate}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <Text style={styles.empty}>{selected} の納品はありません。</Text>
          )
        ) : (
          <Text style={styles.empty}>日付をタップすると納品が表示されます。</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  flex: { flex: 1 },
  note: { fontSize: 13, color: '#666', marginBottom: 12 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  navText: { fontSize: 22, color: '#2563EB', fontWeight: '700' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  weekRow: { flexDirection: 'row' },
  weekCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
    paddingVertical: 4,
  },
  dayCellWrap: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  dayCell: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { backgroundColor: '#2563EB' },
  dayText: { fontSize: 15, color: '#111' },
  daySelectedText: { color: '#fff', fontWeight: '700' },
  sun: { color: '#dc2626' },
  sat: { color: '#2563EB' },
  badge: {
    marginTop: 1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSel: { backgroundColor: '#fff' },
  badgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  listSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
  },
  listTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 10 },
  empty: { fontSize: 14, color: '#999' },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  recordName: { fontSize: 15, fontWeight: '700', color: '#111' },
  recordSub: { fontSize: 12, color: '#666', marginTop: 2 },
  chevron: { fontSize: 22, color: '#ccc', marginLeft: 8 },
});
