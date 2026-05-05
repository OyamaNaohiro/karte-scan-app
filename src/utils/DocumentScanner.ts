import { NativeModules, Platform } from 'react-native';
import { ScanResult } from '../types';

const { DocumentScannerModule } = NativeModules;

if (Platform.OS !== 'ios') {
  throw new Error('DocumentScannerModule はiOS専用です');
}

export const DocumentScanner = {
  scan(): Promise<ScanResult> {
    return DocumentScannerModule.scan();
  },
};
