package geomap.server.security

import geomap.pkg.Ecdsa
import geomap.server.IntegrationTest
import geomap.server.web.InvalidInputException
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class SigningConfigTest : IntegrationTest() {
    @Autowired
    private lateinit var signingKey: ServerSigningKey

    private fun pair() = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()

    @Test
    fun `the server signing key signs what its public key verifies`() {
        val data = "mission".encodeToByteArray()
        assertTrue(Ecdsa.verify(data, Ecdsa.sign(data, signingKey.privateKey), signingKey.publicKey))
    }

    @Test
    fun `refuses keys that are not a pair`() {
        val props = SigningProperties(Pem.encode(pair().private, "PRIVATE KEY"), Pem.encode(pair().public, "PUBLIC KEY"))
        assertFailsWith<IllegalStateException> { SigningConfig().serverSigningKey(props) }
    }

    @Test
    fun `refuses missing keys`() {
        assertFailsWith<InvalidInputException> { SigningConfig().serverSigningKey(SigningProperties("", "")) }
    }
}
