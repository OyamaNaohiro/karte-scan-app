import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { KarteData } from '../types';

interface Props {
  data: KarteData;
  onChange: (updated: KarteData) => void;
}

const FIELDS: { key: keyof KarteData; label: string; multiline?: boolean }[] = [
  { key: 'patientName', label: '氏名' },
  { key: 'birthDate', label: '生年月日' },
  { key: 'gender', label: '性別' },
  { key: 'diagnosis', label: '病名', multiline: true },
  { key: 'doctor', label: '担当医' },
  { key: 'prescription', label: '処方装具名', multiline: true },
];

export function KarteForm({ data, onChange }: Props) {
  function handleChange(key: keyof KarteData, value: string) {
    onChange({ ...data, [key]: value });
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>抽出データの確認・修正</Text>
      {FIELDS.map(({ key, label, multiline }) => (
        <View key={key} style={styles.fieldRow}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={[styles.input, multiline && styles.inputMulti]}
            value={data[key]}
            onChangeText={v => handleChange(key, v)}
            placeholder={`${label}を入力`}
            placeholderTextColor="#aaa"
            multiline={multiline}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
    marginTop: 8,
  },
  fieldRow: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  inputMulti: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
});
