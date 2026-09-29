package geomap.server.security

import org.junit.jupiter.api.Test
import kotlin.test.assertFalse

class SigningPropertiesTest {
    @Test
    fun `toString does not leak the private key`() {
        val props =
            SigningProperties(
                privateKeyPem = "-----BEGIN PRIVATE KEY-----\nsecret-body\n-----END PRIVATE KEY-----",
                publicKeyPem = "-----BEGIN PUBLIC KEY-----\npublic-body\n-----END PUBLIC KEY-----",
            )
        assertFalse(props.toString().contains("secret-body"))
        assertFalse(props.toString().contains("public-body"))
    }
}
