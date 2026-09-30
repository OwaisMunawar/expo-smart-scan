package expo.modules.smartscan

import android.net.Uri
import android.os.SystemClock
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException

class ExpoSmartScanModule : Module() {
  // Creating a recognizer loads the model, so keep one for the module's lifetime.
  private val recognizerDelegate = lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
  private val recognizer by recognizerDelegate

  override fun definition() = ModuleDefinition {
    Name("ExpoSmartScan")

    Function("getCapabilities") {
      mapOf(
        "textRecognition" to true,
        "documentDetection" to false,
        "foundationModels" to "unsupported",
        "foundationModelsReason" to "android"
      )
    }

    // `options` is accepted for signature parity with iOS; the Latin model has no
    // language or accuracy switches.
    AsyncFunction("recognizeText") { uri: String, _: Map<String, Any?>, promise: Promise ->
      recognize(uri, promise)
    }

    AsyncFunction("detectDocument") { _: String, promise: Promise ->
      promise.reject(UnsupportedException("detectDocument"))
    }

    // The JS layer runs OCR + the TypeScript parser on Android, so this is only reached
    // by callers bypassing the public API.
    AsyncFunction("extractReceipt") { _: String, _: Map<String, Any?>, promise: Promise ->
      promise.reject(UnsupportedException("Native extractReceipt"))
    }

    OnDestroy {
      if (recognizerDelegate.isInitialized()) {
        recognizer.close()
      }
    }
  }

  private fun recognize(uri: String, promise: Promise) {
    val parsed = Uri.parse(uri)
    if (parsed.scheme != "file") {
      promise.reject(InvalidUriException(uri))
      return
    }
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    val image = try {
      // fromFilePath reads EXIF orientation, so bounding boxes come back upright.
      InputImage.fromFilePath(context, parsed)
    } catch (e: IOException) {
      promise.reject(ImageLoadException(uri, e))
      return
    }

    val quarterTurn = image.rotationDegrees == 90 || image.rotationDegrees == 270
    val width = if (quarterTurn) image.height else image.width
    val height = if (quarterTurn) image.width else image.height
    val start = SystemClock.elapsedRealtime()

    recognizer.process(image)
      .addOnSuccessListener { text ->
        promise.resolve(
          mapOf(
            "lines" to toLines(text, width.toFloat(), height.toFloat()),
            "imageWidth" to width,
            "imageHeight" to height,
            "durationMs" to (SystemClock.elapsedRealtime() - start).toDouble(),
            "engine" to "ml-kit"
          )
        )
      }
      .addOnFailureListener { e -> promise.reject(RecognitionFailedException(e)) }
  }

  private fun toLines(text: Text, width: Float, height: Float): List<Map<String, Any>> =
    text.textBlocks.flatMap { block ->
      block.lines.mapNotNull { line ->
        val box = line.boundingBox ?: return@mapNotNull null
        mapOf(
          "text" to line.text,
          "confidence" to line.confidence.toDouble(),
          "box" to mapOf(
            "x" to (box.left / width).toDouble(),
            "y" to (box.top / height).toDouble(),
            "width" to (box.width() / width).toDouble(),
            "height" to (box.height() / height).toDouble()
          )
        )
      }
    }
}
