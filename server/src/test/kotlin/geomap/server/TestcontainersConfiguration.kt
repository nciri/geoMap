package geomap.server

import geomap.server.security.Pem
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.springframework.test.context.DynamicPropertyRegistrar
import org.testcontainers.postgresql.PostgreSQLContainer
import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec

@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {
    @Bean
    @ServiceConnection
    fun postgres(): PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")

    // A fresh key pair per test run: no key is ever committed, not even for tests.
    @Bean
    fun signingKeys(): DynamicPropertyRegistrar {
        val pair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        return DynamicPropertyRegistrar { registry ->
            registry.add("geomap.signing.private-key-pem") { Pem.encode(pair.private, "PRIVATE KEY") }
            registry.add("geomap.signing.public-key-pem") { Pem.encode(pair.public, "PUBLIC KEY") }
        }
    }
}
