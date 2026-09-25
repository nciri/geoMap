package geomap.pkg

import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.SecureRandom
import java.security.Signature
import java.security.SignatureException
import java.security.spec.MGF1ParameterSpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource
import javax.crypto.spec.SecretKeySpec

private val random = SecureRandom()

fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

fun b64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)

fun unb64(text: String): ByteArray = Base64.getDecoder().decode(text)

object Sha256 {
    fun hex(data: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(data).toHex()

    fun bytesOf(file: Path): ByteArray {
        val digest = MessageDigest.getInstance("SHA-256")
        Files.newInputStream(file).use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest()
    }
}

object Aes {
    const val ALG = "A256GCM"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128

    fun newKey(): ByteArray = ByteArray(32).also(random::nextBytes)

    fun newIv(): ByteArray = ByteArray(12).also(random::nextBytes)

    fun encrypt(
        key: ByteArray,
        iv: ByteArray,
        plaintext: ByteArray,
        aad: ByteArray,
    ): ByteArray = cipher(Cipher.ENCRYPT_MODE, key, iv, aad).doFinal(plaintext)

    fun decrypt(
        key: ByteArray,
        iv: ByteArray,
        ciphertext: ByteArray,
        aad: ByteArray,
    ): ByteArray = cipher(Cipher.DECRYPT_MODE, key, iv, aad).doFinal(ciphertext)

    private fun cipher(
        mode: Int,
        key: ByteArray,
        iv: ByteArray,
        aad: ByteArray,
    ): Cipher =
        Cipher.getInstance(TRANSFORMATION).apply {
            init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, iv))
            updateAAD(aad)
        }
}

object RsaOaep {
    const val ALG = "RSA-OAEP-SHA256-MGF1SHA1"
    const val TRANSFORMATION = "RSA/ECB/OAEPPadding"

    // MGF1-SHA1 because the Android Keystore supports no other MGF1 digest below API 34.
    val PARAMS = OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT)

    fun wrap(
        key: ByteArray,
        recipient: PublicKey,
    ): ByteArray = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, recipient, PARAMS) }.doFinal(key)
}

// Lets the device keep its private key inside the Android Keystore.
fun interface KeyUnwrapper {
    fun unwrap(wrapped: ByteArray): ByteArray
}

class SoftwareKeyUnwrapper(
    private val privateKey: PrivateKey,
) : KeyUnwrapper {
    override fun unwrap(wrapped: ByteArray): ByteArray =
        Cipher
            .getInstance(RsaOaep.TRANSFORMATION)
            .apply { init(Cipher.DECRYPT_MODE, privateKey, RsaOaep.PARAMS) }
            .doFinal(wrapped)
}

object Ecdsa {
    private const val ALG = "SHA256withECDSA"

    fun sign(
        data: ByteArray,
        key: PrivateKey,
    ): ByteArray =
        Signature.getInstance(ALG).run {
            initSign(key)
            update(data)
            sign()
        }

    fun verify(
        data: ByteArray,
        signature: ByteArray,
        key: PublicKey,
    ): Boolean =
        try {
            Signature.getInstance(ALG).run {
                initVerify(key)
                update(data)
                verify(signature)
            }
        } catch (e: SignatureException) {
            false
        } catch (e: RuntimeException) {
            // Android crypto providers may throw non-SignatureException (e.g. ArrayIndexOutOfBoundsException) on malformed DER.
            false
        }
}
