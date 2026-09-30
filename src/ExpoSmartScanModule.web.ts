import { registerWebModule, NativeModule } from 'expo';

import type { SmartScanCapabilities } from './types';

function unsupported(): Error {
  return Object.assign(new Error('expo-smart-scan has no web implementation.'), {
    code: 'ERR_UNSUPPORTED',
  });
}

class ExpoSmartScanWebModule extends NativeModule {
  getCapabilities(): SmartScanCapabilities {
    return {
      textRecognition: false,
      documentDetection: false,
      foundationModels: 'unsupported',
      foundationModelsReason: 'web',
    };
  }

  async recognizeText(): Promise<never> {
    throw unsupported();
  }

  async detectDocument(): Promise<never> {
    throw unsupported();
  }

  async extractReceipt(): Promise<never> {
    throw unsupported();
  }
}

export default registerWebModule(ExpoSmartScanWebModule, 'ExpoSmartScan');
