import ExpoModulesCore

public class ExpoSmartScanModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoSmartScan")

    AsyncFunction("setValueAsync") { (value: String) in
    }
  }
}
