// Reexport the native module. On web, it will be resolved to ExpoSmartScanModule.web.ts
// and on native platforms to ExpoSmartScanModule.ts
export { default } from './ExpoSmartScanModule';
export * from './ExpoSmartScan.types';
