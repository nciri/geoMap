package geomap.server.security

import geomap.pkg.Ecdsa
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.security.PrivateKey
import java.security.PublicKey

@ConfigurationProperties("geomap.signing")
data class SigningProperties(
    val privateKeyPem: String,
    val publicKeyPem: String,
)

class ServerSigningKey(
    val privateKey: PrivateKey,
    val publicKey: PublicKey,
)

@Configuration
class SigningConfig {
    @Bean
    fun serverSigningKey(props: SigningProperties): ServerSigningKey {
        val key = ServerSigningKey(Pem.privateKey(props.privateKeyPem, "EC"), Pem.publicKey(props.publicKeyPem, "EC"))
        // A mismatched pair would sign packages that no device can verify: fail at startup instead.
        val probe = "geomap-signing-probe".encodeToByteArray()
        check(Ecdsa.verify(probe, Ecdsa.sign(probe, key.privateKey), key.publicKey)) { "geomap.signing keys do not form a pair" }
        return key
    }
}
