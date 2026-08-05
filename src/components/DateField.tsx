import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
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
  const [showPicker, setShowPicker] = useState(false);

  // スピナーで選んだ日付は即座に親の値へ反映する（value経由で入力欄に表示）
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
      <TouchableOpacity style={styles.calBtn} onPress={() => setShowPicker(true)}>
        <Text style={styles.calBtnText}>📅</Text>
      </TouchableOpacity>
      {value ? (
        <TouchableOpacity style={styles.clearBtn} onPress={() => onChange('')}>
          <Text style={styles.clearText}>×</Text>
        </TouchableOpacity>
      ) : null}

      {/* Android: ダイアログで選択して確定 */}
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

      {/* iOS: モーダル内スピナー。選択即反映、「閉じる」で終了 */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPicker(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                themeVariant="light"
                locale="ja-JP"
                style={styles.picker}
                onChange={(_event: unknown, date?: Date) =>
                  date && onChange(toISO(date))
                }
              />
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text style={styles.modalOk}>閉じる</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 12 },
  picker: { width: '100%', height: 216 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 24,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  modalOk: { fontSize: 16, color: '#2563EB', fontWeight: '700' },
});
