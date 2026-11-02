package dev.cocurdex.wire

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.util.zip.Deflater
import java.util.zip.Inflater
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

private const val TRANSFORMATION = "ChaCha20-Poly1305"
private const val KEY_ALGORITHM = "ChaCha20"
private const val CHUNK_LENGTH = 64 * 1024

private class InflateFailedException : CodedException("The data could not be decompressed")

private class InflatedTooLargeException : CodedException("The decompressed data exceeds its limit")

class CocurdexWireModule : Module() {
  private val available: Boolean by lazy {
    runCatching { Cipher.getInstance(TRANSFORMATION) }.isSuccess
  }

  override fun definition() = ModuleDefinition {
    Name("CocurdexWire")

    Constant("available") { available }

    Function("seal") { key: ByteArray, nonce: ByteArray, ad: ByteArray, plaintext: ByteArray ->
      cipher(Cipher.ENCRYPT_MODE, key, nonce, ad).doFinal(plaintext)
    }

    Function("open") { key: ByteArray, nonce: ByteArray, ad: ByteArray, sealed: ByteArray ->
      cipher(Cipher.DECRYPT_MODE, key, nonce, ad).doFinal(sealed)
    }

    Function("deflateRaw") { data: ByteArray -> deflateRaw(data) }

    Function("inflateRaw") { data: ByteArray, maxLength: Int -> inflateRaw(data, maxLength) }
  }

  private fun cipher(mode: Int, key: ByteArray, nonce: ByteArray, ad: ByteArray): Cipher =
    Cipher.getInstance(TRANSFORMATION).apply {
      init(mode, SecretKeySpec(key, KEY_ALGORITHM), IvParameterSpec(nonce))
      updateAAD(ad)
    }

  private fun deflateRaw(data: ByteArray): ByteArray {
    val deflater = Deflater(Deflater.BEST_SPEED, true)
    try {
      deflater.setInput(data)
      deflater.finish()
      val output = ByteArrayOutputStream(data.size / 2 + 64)
      val chunk = ByteArray(CHUNK_LENGTH)
      while (!deflater.finished()) {
        output.write(chunk, 0, deflater.deflate(chunk))
      }
      return output.toByteArray()
    } finally {
      deflater.end()
    }
  }

  private fun inflateRaw(data: ByteArray, maxLength: Int): ByteArray {
    val inflater = Inflater(true)
    try {
      inflater.setInput(data.copyOf(data.size + 1))
      val output = ByteArrayOutputStream()
      val chunk = ByteArray(CHUNK_LENGTH)
      while (!inflater.finished()) {
        val count = inflater.inflate(chunk)
        if (count == 0 && (inflater.needsInput() || inflater.needsDictionary())) {
          throw InflateFailedException()
        }
        output.write(chunk, 0, count)
        if (output.size() > maxLength) throw InflatedTooLargeException()
      }
      return output.toByteArray()
    } catch (error: java.util.zip.DataFormatException) {
      throw InflateFailedException()
    } finally {
      inflater.end()
    }
  }
}
