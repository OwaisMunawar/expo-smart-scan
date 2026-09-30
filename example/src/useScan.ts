import { Asset } from 'expo-asset';
import * as ImagePicker from 'expo-image-picker';
import {
  detectDocument,
  extractReceipt,
  getCapabilities,
  isSmartScanError,
  type DocumentDetectionResult,
  type ReceiptExtractionResult,
} from 'expo-smart-scan';
import { useCallback, useMemo, useState } from 'react';

export interface ScanImage {
  uri: string;
  width: number;
  height: number;
}

export type EngineChoice = 'auto' | 'heuristic';

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning'; image: ScanImage }
  | {
      status: 'done';
      image: ScanImage;
      result: ReceiptExtractionResult;
      document: DocumentDetectionResult | null;
    }
  | { status: 'error'; image: ScanImage | null; message: string };

const SAMPLE = require('../assets/sample-receipt.jpg') as number;

export function useScan() {
  const [state, setState] = useState<ScanState>({ status: 'idle' });
  const [engine, setEngine] = useState<EngineChoice>('auto');
  const capabilities = useMemo(() => getCapabilities(), []);

  const scan = useCallback(
    async (image: ScanImage) => {
      setState({ status: 'scanning', image });
      try {
        const result = await extractReceipt(image.uri, { engine });
        // Document detection is optional polish for the overlay; Android rejects it.
        const document = capabilities.documentDetection
          ? await detectDocument(image.uri).catch(() => null)
          : null;
        setState({ status: 'done', image, result, document });
      } catch (error) {
        const message = isSmartScanError(error) ? `${error.code}: ${error.message}` : String(error);
        setState({ status: 'error', image, message });
      }
    },
    [engine, capabilities.documentDetection]
  );

  const pickFromLibrary = useCallback(async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = picked.assets?.[0];
    if (!picked.canceled && asset) {
      await scan({ uri: asset.uri, width: asset.width, height: asset.height });
    }
  }, [scan]);

  const loadSample = useCallback(async () => {
    const [asset] = await Asset.loadAsync(SAMPLE);
    if (!asset?.localUri) {
      setState({ status: 'error', image: null, message: 'Sample asset failed to load.' });
      return;
    }
    await scan({ uri: asset.localUri, width: asset.width ?? 1, height: asset.height ?? 1 });
  }, [scan]);

  return { state, engine, setEngine, capabilities, pickFromLibrary, loadSample };
}
