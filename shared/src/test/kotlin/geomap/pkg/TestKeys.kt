package geomap.pkg

import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec

object TestKeys {
    val rsa: KeyPair by lazy { rsaPair() }
    val rsaOther: KeyPair by lazy { rsaPair() }
    val ec: KeyPair by lazy { ecPair() }
    val ecOther: KeyPair by lazy { ecPair() }

    private fun rsaPair(): KeyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(3072) }.generateKeyPair()

    private fun ecPair(): KeyPair =
        KeyPairGenerator.getInstance(
            "EC",
        ).apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
}
