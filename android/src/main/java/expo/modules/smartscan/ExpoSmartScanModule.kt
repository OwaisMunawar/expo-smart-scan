package expo.modules.smartscan

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoSmartScanModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoSmartScan")

    AsyncFunction("setValueAsync") { value: String ->
    }
  }
}
