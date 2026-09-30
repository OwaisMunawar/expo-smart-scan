import { registerWebModule, NativeModule } from 'expo';

// ExpoSmartScanModule is not available on the web platform.
class ExpoSmartScanModule extends NativeModule<{}> {}

export default registerWebModule(ExpoSmartScanModule, 'ExpoSmartScanModule');
