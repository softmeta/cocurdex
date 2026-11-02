package dev.cocurdex.aead

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

private const val TRANSFORMATION = "ChaCha20-Poly1305"
private const val KEY_ALGORITHM = "ChaCha20"

class CocurdexAeadModule : Module() {
  private val available: Boolean by lazy {
    runCatching { Cipher.getInstance(TRANSFORMATION) }.isSuccess
  }

  override fun definition() = ModuleDefinition {
    Name("CocurdexAead")

    Constant("available") { available }

    Function("seal") { key: ByteArray, nonce: ByteArray, ad: ByteArray, plaintext: ByteArray ->
      cipher(Cipher.ENCRYPT_MODE, key, nonce, ad).doFinal(plaintext)
    }

    Function("open") { key: ByteArray, nonce: ByteArray, ad: ByteArray, sealed: ByteArray ->
      cipher(Cipher.DECRYPT_MODE, key, nonce, ad).doFinal(sealed)
    }
  }

  private fun cipher(mode: Int, key: ByteArray, nonce: ByteArray, ad: ByteArray): Cipher =
    Cipher.getInstance(TRANSFORMATION).apply {
      init(mode, SecretKeySpec(key, KEY_ALGORITHM), IvParameterSpec(nonce))
      updateAAD(ad)
    }
}
