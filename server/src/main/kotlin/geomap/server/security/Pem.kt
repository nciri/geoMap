package geomap.server.security

import geomap.server.web.InvalidInputException
import java.security.GeneralSecurityException
import java.security.Key
import java.security.KeyFactory
import java.security.PrivateKey
import java.security.PublicKey
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

object Pem {
    fun privateKey(
        pem: String,
        algorithm: String,
    ): PrivateKey = parse("PRIVATE KEY") { KeyFactory.getInstance(algorithm).generatePrivate(PKCS8EncodedKeySpec(der(pem, "PRIVATE KEY"))) }

    fun publicKey(
        pem: String,
        algorithm: String,
    ): PublicKey = parse("PUBLIC KEY") { KeyFactory.getInstance(algorithm).generatePublic(X509EncodedKeySpec(der(pem, "PUBLIC KEY"))) }

    fun encode(
        key: Key,
        label: String,
    ): String =
        "-----BEGIN $label-----\n${Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(key.encoded)}\n-----END $label-----\n"

    private fun der(
        pem: String,
        label: String,
    ): ByteArray {
        val text = pem.trim()
        val begin = "-----BEGIN $label-----"
        val end = "-----END $label-----"
        if (!text.startsWith(begin) || !text.endsWith(end)) throw InvalidInputException("expected a PEM $label")
        return Base64.getMimeDecoder().decode(text.removePrefix(begin).removeSuffix(end))
    }

    private fun <T> parse(
        label: String,
        block: () -> T,
    ): T =
        try {
            block()
        } catch (e: GeneralSecurityException) {
            throw InvalidInputException("invalid PEM $label", e)
        } catch (e: IllegalArgumentException) {
            throw InvalidInputException("invalid PEM $label", e)
        }
}
