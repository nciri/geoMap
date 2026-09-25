package geomap.server.security

import geomap.server.web.InvalidInputException
import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertFailsWith

class PemTest {
    private val ec = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    private val rsa = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()

    @Test
    fun `round trips EC and RSA keys`() {
        assertContentEquals(ec.private.encoded, Pem.privateKey(Pem.encode(ec.private, "PRIVATE KEY"), "EC").encoded)
        assertContentEquals(ec.public.encoded, Pem.publicKey(Pem.encode(ec.public, "PUBLIC KEY"), "EC").encoded)
        assertContentEquals(rsa.public.encoded, Pem.publicKey(Pem.encode(rsa.public, "PUBLIC KEY"), "RSA").encoded)
    }

    @Test
    fun `accepts surrounding whitespace and CRLF line breaks`() {
        val pem = "\r\n  " + Pem.encode(ec.public, "PUBLIC KEY").replace("\n", "\r\n") + "  \n"
        assertContentEquals(ec.public.encoded, Pem.publicKey(pem, "EC").encoded)
    }

    @Test
    fun `rejects missing markers, garbage and the wrong algorithm`() {
        assertFailsWith<InvalidInputException> { Pem.publicKey("", "EC") }
        assertFailsWith<InvalidInputException> { Pem.publicKey("-----BEGIN PUBLIC KEY-----\n%%%\n-----END PUBLIC KEY-----", "EC") }
        assertFailsWith<InvalidInputException> { Pem.publicKey(Pem.encode(ec.public, "PUBLIC KEY"), "RSA") }
        assertFailsWith<InvalidInputException> { Pem.privateKey(Pem.encode(ec.public, "PUBLIC KEY"), "EC") }
    }
}
