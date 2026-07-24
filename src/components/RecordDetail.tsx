import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { SavedRecord, KarteData } from '../types';
import { deleteRecord } from '../utils/db';

interface Props {
  record: SavedRecord;
  onDeleted: () => void;
}

const FIELDS: { key: keyof KarteData; label: string }[] = [
  { key: 'patientName', label: '氏名' },
  { key: 'birthDate', label: '生年月日' },
  { key: 'gender', label: '性別' },
  { key: 'address', label: '住所' },
  { key: 'hospitalName', label: '病院名' },
  { key: 'diagnosis', label: '病名' },
  { key: 'doctor', label: '担当医' },
  { key: 'prescription', label: '処方装具名' },
];

export function RecordDetail({ record, onDeleted }: Props) {
  function confirmDelete() {
    Alert.alert('削除の確認', 'この記録を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRecord(record.id);
            onDeleted();
          } catch (err: any) {
            Alert.alert('削除エラー', err?.message ?? '削除に失敗しました');
          }
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>抽出データ</Text>
      <View style={styles.table}>
        {FIELDS.map(({ key, label }) => (
          <View key={key} style={styles.tableRow}>
            <Text style={styles.tableLabel}>{label}</Text>
            <Text style={styles.tableValue} selectable>
              {record.karteData[key] || '—'}
            </Text>
          </View>
        ))}
      </View>

      {record.imagePaths.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>スキャン画像</Text>
          {record.imagePaths.map((path, i) => (
            <Image
              key={i}
              source={{ uri: `file://${path}` }}
              style={styles.image}
              resizeMode="contain"
            />
          ))}
        </>
      )}

      <Text style={styles.pathLabel}>PDF保存先</Text>
      <Text style={styles.pathText} selectable>
        {record.pdfPath}
      </Text>

      <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
        <Text style={styles.deleteText}>この記録を削除</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginTop: 8,
    marginBottom: 12,
  },
  table: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableLabel: {
    width: 96,
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    backgroundColor: '#f7f7f7',
    padding: 10,
  },
  tableValue: {
    flex: 1,
    fontSize: 14,
    color: '#111',
    padding: 10,
  },
  image: {
    width: '100%',
    height: 460,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  pathLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 8,
  },
  pathText: { fontSize: 11, color: '#aaa', marginTop: 4, marginBottom: 24 },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },
});
