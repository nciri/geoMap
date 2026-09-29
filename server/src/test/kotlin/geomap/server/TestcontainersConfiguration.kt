package geomap.server

import geomap.server.security.Pem
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.springframework.test.context.DynamicPropertyRegistrar
import org.testcontainers.containers.MinIOContainer
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

    // Pinned tag already present locally; do not pull other images (low disk).
    @Bean
    fun minio(): MinIOContainer = MinIOContainer("minio/minio:RELEASE.2024-10-13T13-34-11Z")

    @Bean
    fun storage(minio: MinIOContainer): DynamicPropertyRegistrar =
        DynamicPropertyRegistrar { registry ->
            registry.add("geomap.storage.endpoint", minio::getS3URL)
            registry.add("geomap.storage.access-key", minio::getUserName)
            registry.add("geomap.storage.secret-key", minio::getPassword)
        }
}
