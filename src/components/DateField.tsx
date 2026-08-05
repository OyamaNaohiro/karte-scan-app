import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { toISO, fromISO, normalizeDateInput } from '../utils/date';

interface Props {
  value: string; // ISO(YYYY-MM-DD) or ''
  onChange: (iso: string) => void;
  placeholder?: string;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// その月のカレンダーセル（先頭の空白 + 1〜末日）を作る
function buildCells(year: number, month: number): (number | null)[] {
  const startDow = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return cells;
}

// カレンダー選択と手入力の両対応。値は常に ISO(YYYY-MM-DD) で親へ渡す。
// ネイティブの日付ピッカーは新アーキでonChangeが届かない場合があるため、
// JSだけで実装したカレンダーで確実に反映させる。
export function DateField({ value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const base = fromISO(value);
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth()); // 0-11

  function openCalendar() {
    const d = fromISO(value);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setOpen(true);
  }

  function shiftMonth(delta: number) {
    const m = viewMonth + delta;
    const y = viewYear + Math.floor(m / 12);
    const nm = ((m % 12) + 12) % 12;
    setViewYear(y);
    setViewMonth(nm);
  }

  function pick(day: number) {
    onChange(toISO(new Date(viewYear, viewMonth, day)));
    setOpen(false);
  }

  const cells = buildCells(viewYear, viewMonth);
  const selected = value ? fromISO(value) : null;
  const isSelected = (day: number) =>
    !!selected &&
    selected.getFullYear() === viewYear &&
    selected.getMonth() === viewMonth &&
    selected.getDate() === day;

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(v: string) => onChange(v)}
        onBlur={() => value && onChange(normalizeDateInput(value))}
        placeholder={placeholder ?? 'YYYY-MM-DD'}
        placeholderTextColor="#aaa"
        keyboardType="numbers-and-punctuation"
      />
      <TouchableOpacity style={styles.calBtn} onPress={openCalendar}>
        <Text style={styles.calBtnText}>📅</Text>
      </TouchableOpacity>
      {value ? (
        <TouchableOpacity style={styles.clearBtn} onPress={() => onChange('')}>
          <Text style={styles.clearText}>×</Text>
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.card}>
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
                  style={[
                    styles.weekCell,
                    i === 0 && styles.sun,
                    i === 6 && styles.sat,
                  ]}>
                  {w}
                </Text>
              ))}
            </View>

            {/* 日付グリッド */}
            <View style={styles.grid}>
              {cells.map((day, i) => (
                <View key={i} style={styles.dayCellWrap}>
                  {day === null ? (
                    <View style={styles.dayCell} />
                  ) : (
                    <TouchableOpacity
                      style={[styles.dayCell, isSelected(day) && styles.daySelected]}
                      onPress={() => pick(day)}>
                      <Text
                        style={[
                          styles.dayText,
                          i % 7 === 0 && styles.sun,
                          i % 7 === 6 && styles.sat,
                          isSelected(day) && styles.daySelectedText,
                        ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                onPress={() => {
                  const t = new Date();
                  onChange(toISO(t));
                  setOpen(false);
                }}>
                <Text style={styles.todayText}>今日</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.closeText}>閉じる</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  calBtn: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
  },
  calBtnText: { fontSize: 18 },
  clearBtn: { marginLeft: 4, paddingHorizontal: 8, paddingVertical: 6 },
  clearText: { fontSize: 18, color: '#999' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  navText: { fontSize: 22, color: '#2563EB', fontWeight: '700' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  weekRow: { flexDirection: 'row' },
  weekCell: {
    width: CELL,
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
    paddingVertical: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCellWrap: { width: CELL, alignItems: 'center', paddingVertical: 2 },
  dayCell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { backgroundColor: '#2563EB' },
  dayText: { fontSize: 15, color: '#111' },
  daySelectedText: { color: '#fff', fontWeight: '700' },
  sun: { color: '#dc2626' },
  sat: { color: '#2563EB' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  todayText: { fontSize: 15, color: '#2563EB', fontWeight: '700' },
  closeText: { fontSize: 15, color: '#888', fontWeight: '600' },
});
