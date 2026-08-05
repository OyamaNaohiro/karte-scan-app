import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { toISO, fromISO, normalizeDateInput } from '../utils/date';

interface Props {
  value: string; // ISO(YYYY-MM-DD) or ''
  onChange: (iso: string) => void;
  placeholder?: string;
}

// カレンダー選択と手入力の両対応。値は常に ISO(YYYY-MM-DD) で親へ渡す。
export function DateField({ value, onChange, placeholder }: Props) {
  const [showPicker, setShowPicker] = useState(false); // Android用
  const pickerDate = fromISO(value);

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

      {/* iOS: コンパクト表示。タップでネイティブのカレンダーが開き、選択が即反映される */}
      {Platform.OS === 'ios' && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="compact"
          themeVariant="light"
          locale="ja-JP"
          style={styles.compact}
          onChange={(_event: unknown, date?: Date) => date && onChange(toISO(date))}
        />
      )}

      {/* Android: ボタン→ダイアログ */}
      {Platform.OS === 'android' && (
        <TouchableOpacity style={styles.calBtn} onPress={() => setShowPicker(true)}>
          <Text style={styles.calBtnText}>📅</Text>
        </TouchableOpacity>
      )}
      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          onChange={(_event: unknown, date?: Date) => {
            setShowPicker(false);
            if (date) onChange(toISO(date));
          }}
        />
      )}

      {value ? (
        <TouchableOpacity style={styles.clearBtn} onPress={() => onChange('')}>
          <Text style={styles.clearText}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

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
  compact: { marginLeft: 8 },
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
});
