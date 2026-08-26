import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { SavedRecord, KarteData } from '../types';
import { deleteRecord, insertRecord } from '../utils/db';
import { KarteForm } from './KarteForm';
import { formatYen } from '../utils/format';

interface Props {
  record: SavedRecord;
  onDeleted: () => void;
  onUpdated?: () => void;
}

const FIELDS: { key: keyof KarteData; label: string }[] = [
  { key: 'patientName', label: '氏名' },
  { key: 'birthDate', label: '生年月日' },
  { key: 'gender', label: '性別' },
  { key: 'address', label: '住所' },
  { key: 'phone', label: '電話番号' },
  { key: 'insurance', label: '保険' },
  { key: 'hospitalName', label: '病院名' },
  { key: 'diagnosis', label: '病名' },
  { key: 'doctor', label: '担当医' },
  { key: 'prescription', label: '処方装具名' },
  { key: 'orderDate', label: '受注日' },
  { key: 'deliveryDate', label: '納品日' },
  { key: 'price', label: '装具代金' },
];

const SCREEN = Dimensions.get('window');

export function RecordDetail({ record, onDeleted, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  const [data, setData] = useState<KarteData>(record.karteData);
  const [saving, setSaving] = useState(false);

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

  async function handleSaveEdit() {
    setSaving(true);
    try {
      // idを保持したままupsert（DBの抽出データを更新）
      await insertRecord({ ...record, karteData: data });
      setEditing(false);
      onUpdated?.();
    } catch (err: any) {
      Alert.alert('保存エラー', err?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setData(record.karteData);
    setEditing(false);
  }

  // 編集モード: KarteForm（自前のスクロールを持つ）＋固定アクションバー
  if (editing) {
    return (
      <View style={styles.flex}>
        <View style={styles.formWrap}>
          <KarteForm data={data} onChange={setData} />
        </View>
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={cancelEdit}
            disabled={saving}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSaveEdit}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>保存する</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 閲覧モード
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>抽出データ</Text>
        <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
          <Text style={styles.editText}>編集</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.table}>
        {FIELDS.map(({ key, label }) => (
          <View key={key} style={styles.tableRow}>
            <Text style={styles.tableLabel}>{label}</Text>
            <Text style={styles.tableValue} selectable>
              {key === 'price'
                ? formatYen(data[key]) || '—'
                : data[key] || '—'}
            </Text>
          </View>
        ))}
      </View>

      {record.imagePaths.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>スキャン画像（タップで拡大）</Text>
          {record.imagePaths.map((path, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.8}
              onPress={() => setZoomUri(`file://${path}`)}>
              <Image
                source={{ uri: `file://${path}` }}
                style={styles.image}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ))}
        </>
      )}

      {record.pdfPath ? (
        <>
          <Text style={styles.pathLabel}>PDF保存先</Text>
          <Text style={styles.pathText} selectable>
            {record.pdfPath}
          </Text>
        </>
      ) : null}

      <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
        <Text style={styles.deleteText}>この記録を削除</Text>
      </TouchableOpacity>

      {/* 画像の全画面ズーム表示（ピンチで拡大／ダブルタップ不要） */}
      <Modal
        visible={!!zoomUri}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setZoomUri(null)}>
        <View style={styles.zoomContainer}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.zoomContent}
            maximumZoomScale={5}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}>
            {zoomUri && (
              <Image
                source={{ uri: zoomUri }}
                style={styles.zoomImage}
                resizeMode="contain"
              />
            )}
          </ScrollView>
          <TouchableOpacity
            style={styles.zoomClose}
            onPress={() => setZoomUri(null)}>
            <Text style={styles.zoomCloseText}>✕ 閉じる</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  formWrap: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  content: { padding: 20, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginTop: 8,
    marginBottom: 12,
  },
  editBtn: {
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  editText: { color: '#2563EB', fontSize: 14, fontWeight: '700' },
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
  zoomContainer: { flex: 1, backgroundColor: '#000' },
  zoomContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomImage: { width: SCREEN.width, height: SCREEN.height },
  zoomClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  zoomCloseText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: { color: '#555', fontSize: 15, fontWeight: '700' },
  saveBtn: {
    flex: 2,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
