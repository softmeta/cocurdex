package dev.cocurdex.nightmode

import android.app.UiModeManager
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private val NIGHT_MODES = mapOf(
  "light" to UiModeManager.MODE_NIGHT_NO,
  "dark" to UiModeManager.MODE_NIGHT_YES,
  "system" to UiModeManager.MODE_NIGHT_AUTO,
)

class CocurdexNightModeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CocurdexNightMode")

    Function("setApplicationNightMode") { appearance: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function
      val mode = NIGHT_MODES[appearance] ?: return@Function
      val context = appContext.reactContext ?: return@Function
      val manager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
      manager?.setApplicationNightMode(mode)
    }
  }
}
