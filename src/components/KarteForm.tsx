import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { KarteData } from '../types';

export interface NerCandidates {
  personNames: string[];
  placeNames: string[];
  organizationNames: string[];
}

interface Props {
  data: KarteData;
  onChange: (updated: KarteData) => void;
  ner?: NerCandidates;
}

const FIELDS: { key: keyof KarteData; label: string; multiline?: boolean }[] = [
  { key: 'patientName', label: '氏名' },
  { key: 'birthDate', label: '生年月日' },
  { key: 'gender', label: '性別' },
  { key: 'address', label: '住所', multiline: true },
  { key: 'hospitalName', label: '病院名' },
  { key: 'diagnosis', label: '病名', multiline: true },
  { key: 'doctor', label: '担当医' },
  { key: 'prescription', label: '処方装具名', multiline: true },
];

export function KarteForm({ data, onChange, ner }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [showParsed, setShowParsed] = useState(false);

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
            onChangeText={(v: string) => handleChange(key, v)}
            placeholder={`${label}を入力`}
            placeholderTextColor="#aaa"
            multiline={multiline}
          />
        </View>
      ))}

      {/* 分類結果（デバッグ用） */}
      <View style={styles.rawSection}>
        <TouchableOpacity
          style={styles.rawToggle}
          onPress={() => setShowParsed((v: boolean) => !v)}>
          <Text style={styles.rawToggleText}>
            {showParsed ? '▲ 分類結果を隠す' : '▼ 分類結果を確認する'}
          </Text>
        </TouchableOpacity>
        {showParsed && (
          <View style={styles.parsedBox}>
            {FIELDS.map(({ key, label }) => (
              <View key={key} style={styles.parsedRow}>
                <Text style={styles.parsedLabel}>{label}</Text>
                <Text
                  style={[styles.parsedValue, !data[key] && styles.parsedEmpty]}
                  selectable>
                  {data[key] || '未検出'}
                </Text>
              </View>
            ))}
            {ner && (
              <>
                <Text style={styles.parsedSubTitle}>NER候補</Text>
                <View style={styles.parsedRow}>
                  <Text style={styles.parsedLabel}>人名</Text>
                  <Text
                    style={[
                      styles.parsedValue,
                      !ner.personNames.length && styles.parsedEmpty,
                    ]}
                    selectable>
                    {ner.personNames.join('、') || '未検出'}
                  </Text>
                </View>
                <View style={styles.parsedRow}>
                  <Text style={styles.parsedLabel}>地名</Text>
                  <Text
                    style={[
                      styles.parsedValue,
                      !ner.placeNames.length && styles.parsedEmpty,
                    ]}
                    selectable>
                    {ner.placeNames.join('、') || '未検出'}
                  </Text>
                </View>
                <View style={styles.parsedRow}>
                  <Text style={styles.parsedLabel}>組織名</Text>
                  <Text
                    style={[
                      styles.parsedValue,
                      !ner.organizationNames.length && styles.parsedEmpty,
                    ]}
                    selectable>
                    {ner.organizationNames.join('、') || '未検出'}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}
      </View>

      {/* OCR生テキスト（デバッグ用） */}
      {data.rawText ? (
        <View style={styles.rawSection}>
          <TouchableOpacity
            style={styles.rawToggle}
            onPress={() => setShowRaw((v: boolean) => !v)}>
            <Text style={styles.rawToggleText}>
              {showRaw ? '▲ OCR生テキストを隠す' : '▼ OCR生テキストを確認する'}
            </Text>
          </TouchableOpacity>
          {showRaw && (
            <Text style={styles.rawText} selectable>
              {data.rawText}
            </Text>
          )}
        </View>
      ) : null}
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
  rawSection: {
    marginTop: 8,
    marginBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  rawToggle: {
    paddingVertical: 8,
  },
  rawToggleText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  parsedBox: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f5f7fa',
    borderRadius: 6,
  },
  parsedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  parsedLabel: {
    width: 88,
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  parsedValue: {
    flex: 1,
    fontSize: 13,
    color: '#111',
    lineHeight: 19,
  },
  parsedEmpty: {
    color: '#c00',
    fontStyle: 'italic',
  },
  parsedSubTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#444',
    marginTop: 4,
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e6ec',
  },
  rawText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
    marginTop: 8,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
});
