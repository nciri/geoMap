# Server Publication Foundations Implementation Plan (plan 2c-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare everything publication needs: the `shared/` package library wired into the server, the server's signing key, object storage (MinIO), a registry of signed basemaps, and a registry of devices with their mission assignments.

**Architecture:** `server/` consumes `shared/` as a Gradle composite build. Configuration comes from `geomap.*` properties bound to environment variables (Kubernetes Secrets on ALIAS). `ObjectStore` wraps the MinIO client. Basemaps are uploaded by an administrator as a raw stream; the server hashes while streaming, signs the digest with the same scheme as `shared`'s `BasemapSignature`, and stores the file in MinIO. Until plan 2d automates enrollment (QR code, CSR, PKI), an administrator registers each device by hand with its mTLS certificate fingerprint and its RSA-3072 encryption public key; planners assign enrolled devices to missions.

**Tech Stack:** Kotlin 2.2.20, Spring Boot 4.1.0, `geomap:geomap-shared` (composite build), MinIO Java client 9.0.3, Testcontainers 2.0.5 (`testcontainers-minio`, image `minio/minio:RELEASE.2024-10-13T13-34-11Z`, already pulled locally), PostgreSQL 16, Flyway.

**Spec:** `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` (sections 3, 4, 6.1, 7, 13)

**Plan series:** 2a, 2b done (branch `feature/server`) → **2c-1 (this plan)** → 2c-2 (payload, publication, SD export, withdrawal) → 2d (device enrollment, mTLS sync, PKI adapter).

## Global Constraints

- Everything from plans 2a and 2b still applies (Spring Boot 4.1.0, Kotlin 2.2.20, JVM 17, ProblemDetail errors, agents only suggest, audit without content, `make check` gate, Conventional Commits, **no AI attribution in commit messages — no `Co-Authored-By` line of any kind**).
- New runtime dependencies allowed: `geomap:geomap-shared` (composite build of `../shared`) and `io.minio:minio:9.0.3` only.
- Secrets and endpoints come only from environment variables: `GEOMAP_SIGNING_PRIVATE_KEY_PEM`, `GEOMAP_SIGNING_PUBLIC_KEY_PEM`, `GEOMAP_STORAGE_ENDPOINT`, `GEOMAP_STORAGE_ACCESS_KEY`, `GEOMAP_STORAGE_SECRET_KEY`, `GEOMAP_STORAGE_BUCKET` (default `geomap`). All documented in `.env.example`. Tests generate keys at runtime; never commit a key, even a test one.
- Server signing key: ECDSA P-256, PKCS#8 private PEM + X.509 public PEM; the server refuses to start if they are missing or do not form a pair.
- Basemap signature = `shared`'s scheme: ECDSA (`Ecdsa.sign`) over the file's 32-byte SHA-256 digest; `sha256` stored as lowercase hex, signature as Base64. Basemaps are immutable once registered (409 on re-upload).
- Device fingerprint = lowercase hex SHA-256 of the DER certificate (64 chars); device encryption key = RSA public key of at least 3072 bits (spec §6.2).
- Roles: basemap upload, device registration and revocation → `administrateur`; basemap list → `planificateur` or `administrateur`; assignments → `planificateur`, humans only (agents 403).

## Review Focus

- Missing or mismatched signing keys must stop the server at startup, never produce packages signed with a wrong key. (Task 1.)
- A basemap's recorded `sha256` and signature must verify with `shared`'s `BasemapSignature.verify` on the exact stored bytes. (Task 3.)
- Re-uploading an existing basemap id must be refused (409) and leave the stored file untouched. (Task 3.)
- A device with a weak (< 3072-bit RSA) or non-RSA key, or a malformed fingerprint, must be refused (400); a duplicate fingerprint 409. (Task 4.)
- Assigning a revoked or unknown device, assigning on a withdrawn mission, or assigning as an agent must be refused and change nothing. (Task 4.)

## Notes for implementers

- `shared` exposes `kotlinx-serialization-json` 1.9.0 as an `api` dependency; Spring Boot's dependency management may pin another version. If the build or `shared`'s classes fail at runtime because of it, pin `kotlinx-serialization-json` to 1.9.0 in `server/build.gradle.kts` and report it.
- Never add a `Co-Authored-By` or any AI-attribution line to a commit message.

## File Structure

| File | Responsibility |
|---|---|
| `server/settings.gradle.kts`, `server/build.gradle.kts` | composite build, new dependencies |
| `server/src/main/resources/application.yml`, `.env.example` | `geomap.*` configuration from env |
| `server/src/main/kotlin/geomap/server/GeomapApplication.kt` | `@ConfigurationPropertiesScan` |
| `server/src/main/kotlin/geomap/server/security/Pem.kt` | PEM ↔ key conversion |
| `server/src/main/kotlin/geomap/server/security/SigningConfig.kt` | signing properties + `ServerSigningKey` bean |
| `server/src/main/kotlin/geomap/server/storage/ObjectStore.kt` | storage properties + MinIO put/get |
| `server/src/main/kotlin/geomap/server/basemap/Basemap.kt` | model + repository |
| `server/src/main/kotlin/geomap/server/basemap/BasemapService.kt` | streaming upload, hash, sign, audit |
| `server/src/main/kotlin/geomap/server/basemap/BasemapController.kt` | `/api/basemaps` |
| `server/src/main/kotlin/geomap/server/device/Device.kt` | model + repositories (devices, assignments) |
| `server/src/main/kotlin/geomap/server/device/DeviceService.kt` | registration, revocation, assignments |
| `server/src/main/kotlin/geomap/server/device/DeviceController.kt` | `/api/devices`, `/api/missions/{id}/devices` |
| `server/src/main/kotlin/geomap/server/mission/MissionValidator.kt` | adds `UNKNOWN_BASEMAP` |
| `server/src/main/resources/db/migration/V2__basemap.sql`, `V3__device.sql` | schema |
| `server/src/test/kotlin/geomap/server/TestcontainersConfiguration.kt`, `IntegrationTest.kt` | keys, MinIO, truncation |

---

### Task 1: Shared library and server signing key

**Files:**
- Modify: `server/settings.gradle.kts`, `server/build.gradle.kts`, `server/src/main/resources/application.yml`, `.env.example`, `server/src/main/kotlin/geomap/server/GeomapApplication.kt`, `server/src/test/kotlin/geomap/server/TestcontainersConfiguration.kt`
- Create: `server/src/main/kotlin/geomap/server/security/Pem.kt`, `server/src/main/kotlin/geomap/server/security/SigningConfig.kt`
- Test: `server/src/test/kotlin/geomap/server/security/PemTest.kt`, `server/src/test/kotlin/geomap/server/security/SigningConfigTest.kt`

**Interfaces:**
- Produces: `object Pem { fun privateKey(pem: String, algorithm: String): PrivateKey; fun publicKey(pem: String, algorithm: String): PublicKey; fun encode(key: Key, label: String): String }` (labels `"PRIVATE KEY"` / `"PUBLIC KEY"`; throws `InvalidInputException` for anything that is not a valid PEM key of that algorithm); `@ConfigurationProperties("geomap.signing") data class SigningProperties(privateKeyPem: String, publicKeyPem: String)`; `class ServerSigningKey(val privateKey: PrivateKey, val publicKey: PublicKey)`; `@Configuration class SigningConfig { fun serverSigningKey(props: SigningProperties): ServerSigningKey }` (throws `IllegalStateException` when the keys are not a pair). `shared` classes (`geomap.pkg.*`: `Ecdsa`, `Sha256`, `b64`, `unb64`, `toHex`, `BasemapSignature`, `PackageBuilder`…) become available to the server.

- [ ] **Step 1: Wire the composite build and configuration**

Append to `server/settings.gradle.kts`:

```kotlin
includeBuild("../shared")
```

Add to `server/build.gradle.kts` `dependencies`:

```kotlin
    implementation("geomap:geomap-shared:0.1.0")
```

Add to `server/src/main/resources/application.yml` (top level):

```yaml
geomap:
  signing:
    private-key-pem: ${GEOMAP_SIGNING_PRIVATE_KEY_PEM:}
    public-key-pem: ${GEOMAP_SIGNING_PUBLIC_KEY_PEM:}
```

Append to `.env.example`:

```bash
# Server signing key (ECDSA P-256) for mission packages and basemaps — PKCS#8 / X.509 PEM, from a Kubernetes Secret.
GEOMAP_SIGNING_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GEOMAP_SIGNING_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

In `GeomapApplication.kt`, add `@ConfigurationPropertiesScan` (import `org.springframework.boot.context.properties.ConfigurationPropertiesScan`) next to `@SpringBootApplication`.

In `TestcontainersConfiguration`, add (imports `geomap.server.security.Pem`, `java.security.KeyPairGenerator`, `java.security.spec.ECGenParameterSpec`, `org.springframework.test.context.DynamicPropertyRegistrar`):

```kotlin
    // A fresh key pair per test run: no key is ever committed, not even for tests.
    @Bean
    fun signingKeys(): DynamicPropertyRegistrar {
        val pair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        return DynamicPropertyRegistrar { registry ->
            registry.add("geomap.signing.private-key-pem") { Pem.encode(pair.private, "PRIVATE KEY") }
            registry.add("geomap.signing.public-key-pem") { Pem.encode(pair.public, "PUBLIC KEY") }
        }
    }
```

- [ ] **Step 2: Write the failing tests**

`server/src/test/kotlin/geomap/server/security/PemTest.kt`:

```kotlin
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
```

`server/src/test/kotlin/geomap/server/security/SigningConfigTest.kt`:

```kotlin
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd server && ./gradlew test --tests 'geomap.server.security.PemTest' --tests 'geomap.server.security.SigningConfigTest'`
Expected: FAIL, compilation errors `Unresolved reference 'Pem'` / `'ServerSigningKey'`.

- [ ] **Step 4: Write the implementation**

`server/src/main/kotlin/geomap/server/security/Pem.kt`:

```kotlin
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
    ): String = "-----BEGIN $label-----\n${Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(key.encoded)}\n-----END $label-----\n"

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
```

(`InvalidInputException` accepts an optional `cause` since plan 2b and extends `RuntimeException`, so the "expected a PEM" error from `der` passes through both catches untouched.)

`server/src/main/kotlin/geomap/server/security/SigningConfig.kt`:

```kotlin
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
```

- [ ] **Step 5: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `PemTest` (3) and `SigningConfigTest` (3) pass with all earlier tests.

- [ ] **Step 6: Commit**

```bash
git add .env.example server
git commit -m "feat(server): load the package signing key and use the shared package library"
```

---

### Task 2: Object storage

**Files:**
- Modify: `server/build.gradle.kts`, `server/src/main/resources/application.yml`, `.env.example`, `server/src/test/kotlin/geomap/server/TestcontainersConfiguration.kt`
- Create: `server/src/main/kotlin/geomap/server/storage/ObjectStore.kt`
- Test: `server/src/test/kotlin/geomap/server/storage/ObjectStoreTest.kt`

**Interfaces:**
- Produces: `@ConfigurationProperties("geomap.storage") data class StorageProperties(endpoint: String, accessKey: String, secretKey: String, bucket: String)`; `@Component class ObjectStore` with `put(key: String, content: InputStream, size: Long, contentType: String)` (creates the bucket on first write) and `get(key: String): InputStream` (caller closes).

- [ ] **Step 1: Add dependencies, configuration and the MinIO test container**

`server/build.gradle.kts` `dependencies`:

```kotlin
    implementation("io.minio:minio:9.0.3")
    testImplementation("org.testcontainers:testcontainers-minio")
```

`application.yml`, under `geomap:`:

```yaml
  storage:
    endpoint: ${GEOMAP_STORAGE_ENDPOINT:}
    access-key: ${GEOMAP_STORAGE_ACCESS_KEY:}
    secret-key: ${GEOMAP_STORAGE_SECRET_KEY:}
    bucket: ${GEOMAP_STORAGE_BUCKET:geomap}
```

`.env.example`:

```bash
# ALIAS MinIO (S3) — basemaps and mission packages.
GEOMAP_STORAGE_ENDPOINT=http://minio.alias.example:9000
GEOMAP_STORAGE_ACCESS_KEY=change-me
GEOMAP_STORAGE_SECRET_KEY=change-me
GEOMAP_STORAGE_BUCKET=geomap
```

`TestcontainersConfiguration` (import `org.testcontainers.containers.MinIOContainer`):

```kotlin
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
```

- [ ] **Step 2: Write the failing test**

`server/src/test/kotlin/geomap/server/storage/ObjectStoreTest.kt`:

```kotlin
package geomap.server.storage

import geomap.server.IntegrationTest
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID
import kotlin.random.Random
import kotlin.test.assertContentEquals
import kotlin.test.assertFails

class ObjectStoreTest : IntegrationTest() {
    @Autowired
    private lateinit var store: ObjectStore

    private fun key() = "test/${UUID.randomUUID()}"

    @Test
    fun `stores and reads back an object`() {
        val bytes = "zone-nord".encodeToByteArray()
        val key = key()
        store.put(key, bytes.inputStream(), bytes.size.toLong(), "application/octet-stream")
        assertContentEquals(bytes, store.get(key).use { it.readBytes() })
    }

    @Test
    fun `streams a multi-megabyte object`() {
        val bytes = Random(42).nextBytes(6 * 1024 * 1024)
        val key = key()
        store.put(key, bytes.inputStream(), bytes.size.toLong(), "application/vnd.pmtiles")
        assertContentEquals(bytes, store.get(key).use { it.readBytes() })
    }

    @Test
    fun `reading a missing object fails`() {
        assertFails { store.get(key()).use { it.readBytes() } }
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.storage.ObjectStoreTest`
Expected: FAIL, compilation error `Unresolved reference 'ObjectStore'`.

- [ ] **Step 4: Write the implementation**

`server/src/main/kotlin/geomap/server/storage/ObjectStore.kt`:

```kotlin
package geomap.server.storage

import io.minio.BucketExistsArgs
import io.minio.GetObjectArgs
import io.minio.MakeBucketArgs
import io.minio.MinioClient
import io.minio.PutObjectArgs
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component
import java.io.InputStream

@ConfigurationProperties("geomap.storage")
data class StorageProperties(
    val endpoint: String,
    val accessKey: String,
    val secretKey: String,
    val bucket: String,
)

@Component
class ObjectStore(
    private val props: StorageProperties,
) {
    private val client =
        MinioClient
            .builder()
            .endpoint(props.endpoint)
            .credentials(props.accessKey, props.secretKey)
            .build()

    @Volatile
    private var bucketReady = false

    fun put(
        key: String,
        content: InputStream,
        size: Long,
        contentType: String,
    ) {
        ensureBucket()
        client.putObject(
            PutObjectArgs
                .builder()
                .bucket(props.bucket)
                .`object`(key)
                .stream(content, size, -1L)
                .contentType(contentType)
                .build(),
        )
    }

    fun get(key: String): InputStream =
        client.getObject(
            GetObjectArgs
                .builder()
                .bucket(props.bucket)
                .`object`(key)
                .build(),
        )

    // ALIAS may pre-provision the bucket; create it lazily so startup does not depend on MinIO being up.
    private fun ensureBucket() {
        if (bucketReady) return
        synchronized(this) {
            if (bucketReady) return
            if (!client.bucketExists(BucketExistsArgs.builder().bucket(props.bucket).build())) {
                client.makeBucket(MakeBucketArgs.builder().bucket(props.bucket).build())
            }
            bucketReady = true
        }
    }
}
```

If the MinIO 9.0.3 builder signatures differ from the above (for example `stream(InputStream, Long, Long)` parameter types), make the smallest compiling change and report it.

- [ ] **Step 5: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `ObjectStoreTest` (3) and all earlier tests pass.

- [ ] **Step 6: Commit**

```bash
git add .env.example server
git commit -m "feat(server): store objects in MinIO"
```

---

### Task 3: Signed basemap registry

**Files:**
- Create: `server/src/main/resources/db/migration/V2__basemap.sql`, `server/src/main/kotlin/geomap/server/basemap/Basemap.kt`, `server/src/main/kotlin/geomap/server/basemap/BasemapService.kt`, `server/src/main/kotlin/geomap/server/basemap/BasemapController.kt`
- Modify: `server/src/main/kotlin/geomap/server/mission/MissionValidator.kt`, `server/src/test/kotlin/geomap/server/IntegrationTest.kt` (truncate `basemap`), `server/src/test/kotlin/geomap/server/mission/MissionValidationTest.kt`
- Test: `server/src/test/kotlin/geomap/server/basemap/BasemapApiTest.kt`

**Interfaces:**
- Consumes: `ObjectStore` (Task 2), `ServerSigningKey` (Task 1), `geomap.pkg.Ecdsa`, `geomap.pkg.b64`, `geomap.pkg.toHex`, `AuditRepository`/`AuditEvent`, `Actor`, `Clock`.
- Produces: `data class Basemap(id: String, name: String, sizeBytes: Long, sha256: String, signature: String, createdBy: String, createdAt: Instant)`; `BasemapRepository.insert(Basemap)`, `.find(id): Basemap?`, `.findAll(): List<Basemap>` (by id); `BasemapService.upload(actor, id, name, content: InputStream, size: Long): Basemap`, `.list()`; `BasemapService.objectKey(id) = "basemaps/<id>.pmtiles"`; HTTP `PUT /api/basemaps/{id}?name=<name>` (`application/octet-stream` body, `administrateur`) → 201, `GET /api/basemaps` (`planificateur` or `administrateur`); validator error `UNKNOWN_BASEMAP` ("basemap <id> is not registered").

Rules: id matches `^[a-z0-9-]{1,64}$` (same as a mission's `basemapId`); name 1..200 chars after trim; `Content-Length` required and > 0 (else 400); id already registered → 409 with nothing written; agents → 403. Audit `basemap.upload`, target `basemap:<id>`, details `{"sizeBytes": …}`.

- [ ] **Step 1: Write the migration and update the test base**

`server/src/main/resources/db/migration/V2__basemap.sql`:

```sql
CREATE TABLE basemap (
    id         TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,64}$'),
    name       TEXT        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    size_bytes BIGINT      NOT NULL CHECK (size_bytes > 0),
    sha256     TEXT        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    signature  TEXT        NOT NULL,
    created_by TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
```

In `IntegrationTest.setUpMvc`, change the truncation to:

```kotlin
        jdbc.sql("TRUNCATE audit_event, feature, mission, basemap").update()
```

- [ ] **Step 2: Write the failing tests**

`server/src/test/kotlin/geomap/server/basemap/BasemapApiTest.kt`:

```kotlin
package geomap.server.basemap

import com.jayway.jsonpath.JsonPath
import geomap.pkg.BasemapSignature
import geomap.pkg.Sha256
import geomap.pkg.unb64
import geomap.server.IntegrationTest
import geomap.server.security.ServerSigningKey
import geomap.server.storage.ObjectStore
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.nio.file.Files
import kotlin.random.Random
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BasemapApiTest : IntegrationTest() {
    @Autowired
    private lateinit var store: ObjectStore

    @Autowired
    private lateinit var signingKey: ServerSigningKey

    private val tiles = Random(7).nextBytes(200_000)

    private fun upload(
        id: String = "zone-nord",
        bytes: ByteArray = tiles,
        who: RequestPostProcessor = admin(),
        name: String? = "Zone Nord",
    ) = mvc.put("/api/basemaps/$id" + (name?.let { "?name=$it" } ?: "")) {
        with(who)
        contentType = MediaType.APPLICATION_OCTET_STREAM
        content = bytes
    }

    private fun stored(id: String) = store.get(BasemapService.objectKey(id)).use { it.readBytes() }

    @Test
    fun `an administrator registers a signed basemap`() {
        val body =
            upload()
                .andExpect {
                    status { isCreated() }
                    jsonPath("$.id") { value("zone-nord") }
                    jsonPath("$.sizeBytes") { value(tiles.size) }
                    jsonPath("$.sha256") { value(Sha256.hex(tiles)) }
                }.andReturn()
                .response.contentAsString
        val file = Files.createTempFile("zone-nord", ".pmtiles")
        Files.write(file, stored("zone-nord"))
        assertContentEquals(tiles, Files.readAllBytes(file))
        assertTrue(BasemapSignature.verify(file, unb64(JsonPath.read(body, "$.signature")), signingKey.publicKey))
    }

    @Test
    fun `a registered basemap cannot be replaced`() {
        upload()
        upload(bytes = Random(8).nextBytes(1000)).andExpect { status { isConflict() } }
        assertContentEquals(tiles, stored("zone-nord"))
    }

    @Test
    fun `rejects an invalid id, a missing name or an empty file`() {
        upload(id = "Zone_Nord").andExpect { status { isBadRequest() } }
        upload(name = null).andExpect { status { isBadRequest() } }
        upload(bytes = ByteArray(0)).andExpect { status { isBadRequest() } }
    }

    @Test
    fun `only an administrator uploads`() {
        upload(who = planner()).andExpect { status { isForbidden() } }
    }

    @Test
    fun `planners and administrators list registered basemaps`() {
        upload()
        mvc.get("/api/basemaps") { with(planner()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value("zone-nord") }
        }
        assertEquals(1, JsonPath.read<Int>(mvc.get("/api/basemaps") { with(admin()) }.andReturn().response.contentAsString, "$.length()"))
    }
}
```

In `MissionValidationTest`:
- add `@Autowired private lateinit var basemaps: BasemapRepository` (imports `geomap.server.basemap.Basemap`, `geomap.server.basemap.BasemapRepository`);
- at the start of `createCompleteMission()`, register the basemap the mission uses:

```kotlin
        basemaps.insert(Basemap("zone-nord", "Zone Nord", 1, "0".repeat(64), "c2ln", "root", Instant.now()))
```

- add:

```kotlin
    @Test
    fun `a mission on an unregistered basemap is not publishable`() {
        missionId = createMission("""{"name":"Op Sud","basemapId":"zone-sud","validUntil":"2099-01-01T00:00:00Z"}""")
        add(infantry)
        validation().andExpect {
            jsonPath("$.publishable") { value(false) }
            jsonPath("$.errors[0].code") { value("UNKNOWN_BASEMAP") }
        }
    }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd server && ./gradlew test --tests geomap.server.basemap.BasemapApiTest --tests geomap.server.mission.MissionValidationTest`
Expected: FAIL, compilation errors `Unresolved reference 'BasemapRepository'`.

- [ ] **Step 4: Write the implementation**

`server/src/main/kotlin/geomap/server/basemap/Basemap.kt`:

```kotlin
package geomap.server.basemap

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant

data class Basemap(
    val id: String,
    val name: String,
    val sizeBytes: Long,
    val sha256: String,
    val signature: String,
    val createdBy: String,
    val createdAt: Instant,
)

@Repository
class BasemapRepository(
    private val jdbc: JdbcClient,
) {
    fun insert(basemap: Basemap) {
        jdbc
            .sql(
                """
                INSERT INTO basemap (id, name, size_bytes, sha256, signature, created_by, created_at)
                VALUES (:id, :name, :sizeBytes, :sha256, :signature, :createdBy, :createdAt)
                """.trimIndent(),
            ).param("id", basemap.id)
            .param("name", basemap.name)
            .param("sizeBytes", basemap.sizeBytes)
            .param("sha256", basemap.sha256)
            .param("signature", basemap.signature)
            .param("createdBy", basemap.createdBy)
            .param("createdAt", basemap.createdAt.toUtc())
            .update()
    }

    fun find(id: String): Basemap? =
        jdbc
            .sql("SELECT * FROM basemap WHERE id = :id")
            .param("id", id)
            .query { rs, _ -> map(rs) }
            .optional()
            .orElse(null)

    fun findAll(): List<Basemap> = jdbc.sql("SELECT * FROM basemap ORDER BY id").query { rs, _ -> map(rs) }.list()

    private fun map(rs: ResultSet) =
        Basemap(
            id = rs.getString("id"),
            name = rs.getString("name"),
            sizeBytes = rs.getLong("size_bytes"),
            sha256 = rs.getString("sha256"),
            signature = rs.getString("signature"),
            createdBy = rs.getString("created_by"),
            createdAt = rs.instant("created_at")!!,
        )
}
```

`server/src/main/kotlin/geomap/server/basemap/BasemapService.kt`:

```kotlin
package geomap.server.basemap

import geomap.pkg.Ecdsa
import geomap.pkg.b64
import geomap.pkg.toHex
import geomap.server.audit.AuditEvent
import geomap.server.audit.AuditRepository
import geomap.server.security.Actor
import geomap.server.security.ServerSigningKey
import geomap.server.storage.ObjectStore
import geomap.server.web.ConflictException
import geomap.server.web.ForbiddenException
import geomap.server.web.InvalidInputException
import org.springframework.stereotype.Service
import java.io.InputStream
import java.security.DigestInputStream
import java.security.MessageDigest
import java.time.Clock

@Service
class BasemapService(
    private val basemaps: BasemapRepository,
    private val store: ObjectStore,
    private val signingKey: ServerSigningKey,
    private val audit: AuditRepository,
    private val clock: Clock,
) {
    fun list(): List<Basemap> = basemaps.findAll()

    fun upload(
        actor: Actor,
        id: String,
        name: String,
        content: InputStream,
        size: Long,
    ): Basemap {
        if (actor.isAgent) throw ForbiddenException("agents cannot register basemaps")
        if (!ID.matches(id)) throw InvalidInputException("basemap id must match ${ID.pattern}")
        val trimmed = name.trim()
        if (trimmed.length !in 1..200) throw InvalidInputException("name must be 1 to 200 characters")
        if (size <= 0) throw InvalidInputException("a non-empty body with a Content-Length is required")
        // ponytail: check-then-write race between two admins uploading the same id; the primary key rejects the second row.
        if (basemaps.find(id) != null) throw ConflictException("basemap $id already exists")

        val digest = MessageDigest.getInstance("SHA-256")
        store.put(objectKey(id), DigestInputStream(content, digest), size, "application/vnd.pmtiles")
        val sha256 = digest.digest()
        // Same scheme as shared BasemapSignature: ECDSA over the file's SHA-256 digest.
        val now = clock.instant()
        val basemap = Basemap(id, trimmed, size, sha256.toHex(), b64(Ecdsa.sign(sha256, signingKey.privateKey)), actor.user, now)
        basemaps.insert(basemap)
        audit.record(AuditEvent(now, actor.user, actor.agent, "basemap.upload", "basemap:$id", mapOf("sizeBytes" to size)))
        return basemap
    }

    companion object {
        private val ID = Regex("^[a-z0-9-]{1,64}$")

        fun objectKey(id: String) = "basemaps/$id.pmtiles"
    }
}
```

`server/src/main/kotlin/geomap/server/basemap/BasemapController.kt`:

```kotlin
package geomap.server.basemap

import geomap.server.security.Actor
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/basemaps")
class BasemapController(
    private val service: BasemapService,
) {
    @GetMapping
    @PreAuthorize("hasAnyRole('planificateur', 'administrateur')")
    fun list(): List<Basemap> = service.list()

    // Raw body instead of multipart: basemaps weigh hundreds of MB and are streamed straight to MinIO.
    @PutMapping("/{id}", consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('administrateur')")
    fun upload(
        @PathVariable id: String,
        @RequestParam name: String,
        request: HttpServletRequest,
        authentication: Authentication,
    ): Basemap = service.upload(Actor.of(authentication), id, name, request.inputStream, request.contentLengthLong)
}
```

In `MissionValidator`: add the constructor parameter `private val basemaps: BasemapRepository` (import `geomap.server.basemap.BasemapRepository`) and replace `if (mission.basemapId == null) errors += ValidationIssue("NO_BASEMAP", "mission has no basemap")` with:

```kotlin
        val basemapId = mission.basemapId
        when {
            basemapId == null -> errors += ValidationIssue("NO_BASEMAP", "mission has no basemap")
            basemaps.find(basemapId) == null -> errors += ValidationIssue("UNKNOWN_BASEMAP", "basemap $basemapId is not registered")
        }
```

- [ ] **Step 5: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `BasemapApiTest` (5), `MissionValidationTest` (7) and all earlier tests pass.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): register signed basemaps in object storage"
```

---

### Task 4: Device registry and mission assignments

**Files:**
- Create: `server/src/main/resources/db/migration/V3__device.sql`, `server/src/main/kotlin/geomap/server/device/Device.kt`, `server/src/main/kotlin/geomap/server/device/DeviceService.kt`, `server/src/main/kotlin/geomap/server/device/DeviceController.kt`
- Modify: `server/src/test/kotlin/geomap/server/IntegrationTest.kt` (truncate `assignment`, `device`)
- Test: `server/src/test/kotlin/geomap/server/device/DeviceApiTest.kt`, `server/src/test/kotlin/geomap/server/device/AssignmentApiTest.kt`

**Interfaces:**
- Consumes: `Pem` (Task 1), `MissionService.get/editable` (2a; `editable` takes the mission row lock, 404/409), `AuditRepository`, `Actor`, `Clock`.
- Produces:
  - `enum class DeviceStatus { ENROLLED, REVOKED }`; `data class Device(id: UUID, name: String, certSha256: String, encryptionKey: String /* Base64 X.509 DER */, status: DeviceStatus, lastContact: Instant?, createdAt: Instant)` with `fun publicKey(): PublicKey` and `fun view(): DeviceView`; `data class DeviceView(id, name, certSha256, status, lastContact, createdAt)` (API output, no key)
  - `DeviceRepository.insert/find/findAll/updateStatus(id, status)`; `AssignmentRepository.replace(missionId, deviceIds: Set<UUID>)`, `.devices(missionId): List<Device>`
  - `DeviceService.register(actor, DeviceRegistration): Device`, `.list()`, `.revoke(actor, id): Device`, `.assign(actor, missionId, deviceIds: Set<UUID>): List<Device>`, `.assigned(missionId): List<Device>` — plan 2c-2 builds package recipients from `assigned(...)` filtered on `ENROLLED`
  - `data class DeviceRegistration(name: String, certSha256: String, encryptionPublicKeyPem: String)`, `data class Assignment(deviceIds: Set<UUID>)`
  - HTTP (`administrateur`): `POST /api/devices` → 201 `DeviceView`, `GET /api/devices`, `POST /api/devices/{id}/revoke`; (`planificateur`): `PUT /api/missions/{missionId}/devices` body `Assignment` → `List<DeviceView>`, `GET /api/missions/{missionId}/devices`

Rules: name 1..100 after trim; `certSha256` matches `^[0-9a-f]{64}$`; key must be an RSA public key ≥ 3072 bits (else 400 "the encryption key must be RSA with at least 3072 bits"); duplicate fingerprint → 409; revoke is idempotent. Assignment: agents 403; mission must be editable (404 unknown, 409 withdrawn); every device must exist and be `ENROLLED` (else 400 "device <id> is not enrolled"); the set replaces the previous one; assigning does not change the mission status (spec §5.6: the package is rebuilt, not re-drafted — plan 2c-2). Audit `device.register`, `device.revoke` (target `device:<id>`), `mission.assign` (target `mission:<id>`, details `{"devices": <count>}`).

- [ ] **Step 1: Write the migration and update the test base**

`server/src/main/resources/db/migration/V3__device.sql`:

```sql
CREATE TABLE device (
    id             UUID PRIMARY KEY,
    name           TEXT        NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    cert_sha256    TEXT        NOT NULL UNIQUE CHECK (cert_sha256 ~ '^[0-9a-f]{64}$'),
    encryption_key TEXT        NOT NULL,
    status         TEXT        NOT NULL CHECK (status IN ('ENROLLED', 'REVOKED')),
    last_contact   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL
);

CREATE TABLE assignment (
    mission_id UUID NOT NULL REFERENCES mission (id) ON DELETE CASCADE,
    device_id  UUID NOT NULL REFERENCES device (id),
    PRIMARY KEY (mission_id, device_id)
);
```

In `IntegrationTest.setUpMvc`, change the truncation to:

```kotlin
        jdbc.sql("TRUNCATE audit_event, assignment, feature, mission, basemap, device").update()
```

- [ ] **Step 2: Write the failing tests**

`server/src/test/kotlin/geomap/server/device/DeviceApiTest.kt`:

```kotlin
package geomap.server.device

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import geomap.server.security.Pem
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.security.KeyPairGenerator
import java.security.PublicKey
import java.security.spec.ECGenParameterSpec

class DeviceApiTest : IntegrationTest() {
    companion object {
        val rsa3072: String by lazy { pem(KeyPairGenerator.getInstance("RSA").apply { initialize(3072) }.generateKeyPair().public) }
        val rsa2048: String by lazy { pem(KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair().public) }
        val ec: String by lazy { pem(KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair().public) }

        // JSON-escaped PEM: newlines become the two characters \n.
        private fun pem(key: PublicKey) = Pem.encode(key, "PUBLIC KEY").replace("\n", "\\n")

        fun registration(
            name: String = "Tablette 01",
            cert: String = "a".repeat(64),
            key: String = rsa3072,
        ) = """{"name":"$name","certSha256":"$cert","encryptionPublicKeyPem":"$key"}"""
    }

    private fun register(
        body: String = registration(),
        who: RequestPostProcessor = admin(),
    ) = mvc.post("/api/devices") {
        with(who)
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    @Test
    fun `an administrator registers a device`() {
        register().andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("ENROLLED") }
            jsonPath("$.certSha256") { value("a".repeat(64)) }
            jsonPath("$.encryptionKey") { doesNotExist() }
        }
    }

    @Test
    fun `rejects weak or non RSA keys and malformed fingerprints`() {
        register(registration(key = rsa2048)).andExpect { status { isBadRequest() } }
        register(registration(key = ec)).andExpect { status { isBadRequest() } }
        register(registration(cert = "A".repeat(64))).andExpect { status { isBadRequest() } }
        register(registration(cert = "ab:cd")).andExpect { status { isBadRequest() } }
        mvc.get("/api/devices") { with(admin()) }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `a fingerprint is registered once`() {
        register()
        register(registration(name = "Tablette 02")).andExpect { status { isConflict() } }
    }

    @Test
    fun `revoking is idempotent`() {
        val id = JsonPath.read<String>(register().andReturn().response.contentAsString, "$.id")
        repeat(2) {
            mvc.post("/api/devices/$id/revoke") { with(admin()) }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("REVOKED") }
            }
        }
    }

    @Test
    fun `only an administrator manages devices`() {
        register(who = planner()).andExpect { status { isForbidden() } }
        mvc.get("/api/devices") { with(planner()) }.andExpect { status { isForbidden() } }
    }
}
```

`server/src/test/kotlin/geomap/server/device/AssignmentApiTest.kt`:

```kotlin
package geomap.server.device

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.RequestPostProcessor

class AssignmentApiTest : IntegrationTest() {
    private lateinit var missionId: String
    private lateinit var deviceA: String
    private lateinit var deviceB: String

    private fun device(cert: Char): String {
        val body =
            mvc
                .post("/api/devices") {
                    with(admin())
                    contentType = MediaType.APPLICATION_JSON
                    content = DeviceApiTest.registration(name = "Tablette $cert", cert = "$cert".repeat(64))
                }.andReturn()
                .response.contentAsString
        return JsonPath.read(body, "$.id")
    }

    @BeforeEach
    fun setUp() {
        val body =
            mvc
                .post("/api/missions") {
                    with(planner())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"name":"Op Nord"}"""
                }.andReturn()
                .response.contentAsString
        missionId = JsonPath.read(body, "$.id")
        deviceA = device('a')
        deviceB = device('b')
    }

    private fun assign(
        vararg ids: String,
        who: RequestPostProcessor = planner(),
        mission: String = missionId,
    ) = mvc.put("/api/missions/$mission/devices") {
        with(who)
        contentType = MediaType.APPLICATION_JSON
        content = """{"deviceIds":[${ids.joinToString(",") { "\"$it\"" }}]}"""
    }

    private fun assigned() = mvc.get("/api/missions/$missionId/devices") { with(planner()) }

    @Test
    fun `a planner assigns enrolled devices`() {
        assign(deviceA, deviceB).andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
        }
        assigned().andExpect { jsonPath("$.length()") { value(2) } }
    }

    @Test
    fun `a new assignment replaces the previous one`() {
        assign(deviceA, deviceB)
        assign(deviceB)
        assigned().andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(deviceB) }
        }
    }

    @Test
    fun `refuses a revoked or unknown device and changes nothing`() {
        assign(deviceA)
        mvc.post("/api/devices/$deviceB/revoke") { with(admin()) }
        assign(deviceA, deviceB).andExpect { status { isBadRequest() } }
        assign("00000000-0000-0000-0000-000000000000").andExpect { status { isBadRequest() } }
        assigned().andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(deviceA) }
        }
    }

    @Test
    fun `an agent cannot assign devices`() {
        assign(deviceA, who = agent()).andExpect { status { isForbidden() } }
        assigned().andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `a withdrawn or unknown mission cannot be assigned`() {
        jdbc.sql("UPDATE mission SET status = 'WITHDRAWN' WHERE id = CAST(:id AS uuid)").param("id", missionId).update()
        assign(deviceA).andExpect { status { isConflict() } }
        assign(deviceA, mission = "00000000-0000-0000-0000-000000000000").andExpect { status { isNotFound() } }
    }

    @Test
    fun `assigning does not change the mission status`() {
        jdbc.sql("UPDATE mission SET status = 'PUBLISHED' WHERE id = CAST(:id AS uuid)").param("id", missionId).update()
        assign(deviceA)
        mvc.get("/api/missions/$missionId") { with(planner()) }.andExpect { jsonPath("$.status") { value("PUBLISHED") } }
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd server && ./gradlew test --tests 'geomap.server.device.*'`
Expected: FAIL — the routes do not exist (404 instead of the expected statuses). `only an administrator manages devices` and `an agent cannot assign devices` may already pass partially (method security is checked before routing only once routes exist) — they pin the rules.

- [ ] **Step 4: Write the implementation**

`server/src/main/kotlin/geomap/server/device/Device.kt`:

```kotlin
package geomap.server.device

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.security.KeyFactory
import java.security.PublicKey
import java.security.spec.X509EncodedKeySpec
import java.sql.ResultSet
import java.time.Instant
import java.util.Base64
import java.util.UUID

enum class DeviceStatus { ENROLLED, REVOKED }

data class Device(
    val id: UUID,
    val name: String,
    val certSha256: String,
    val encryptionKey: String,
    val status: DeviceStatus,
    val lastContact: Instant?,
    val createdAt: Instant,
) {
    fun publicKey(): PublicKey = KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(encryptionKey)))

    fun view() = DeviceView(id, name, certSha256, status, lastContact, createdAt)
}

data class DeviceView(
    val id: UUID,
    val name: String,
    val certSha256: String,
    val status: DeviceStatus,
    val lastContact: Instant?,
    val createdAt: Instant,
)

@Repository
class DeviceRepository(
    private val jdbc: JdbcClient,
) {
    fun insert(device: Device) {
        jdbc
            .sql(
                """
                INSERT INTO device (id, name, cert_sha256, encryption_key, status, last_contact, created_at)
                VALUES (:id, :name, :certSha256, :encryptionKey, :status, :lastContact, :createdAt)
                """.trimIndent(),
            ).param("id", device.id)
            .param("name", device.name)
            .param("certSha256", device.certSha256)
            .param("encryptionKey", device.encryptionKey)
            .param("status", device.status.name)
            .param("lastContact", device.lastContact?.toUtc())
            .param("createdAt", device.createdAt.toUtc())
            .update()
    }

    fun find(id: UUID): Device? =
        jdbc
            .sql("SELECT * FROM device WHERE id = :id")
            .param("id", id)
            .query { rs, _ -> map(rs) }
            .optional()
            .orElse(null)

    fun findAll(): List<Device> = jdbc.sql("SELECT * FROM device ORDER BY name, id").query { rs, _ -> map(rs) }.list()

    fun updateStatus(
        id: UUID,
        status: DeviceStatus,
    ) {
        jdbc
            .sql("UPDATE device SET status = :status WHERE id = :id")
            .param("id", id)
            .param("status", status.name)
            .update()
    }

    fun map(rs: ResultSet) =
        Device(
            id = rs.getObject("id", UUID::class.java),
            name = rs.getString("name"),
            certSha256 = rs.getString("cert_sha256"),
            encryptionKey = rs.getString("encryption_key"),
            status = DeviceStatus.valueOf(rs.getString("status")),
            lastContact = rs.instant("last_contact"),
            createdAt = rs.instant("created_at")!!,
        )
}

@Repository
class AssignmentRepository(
    private val jdbc: JdbcClient,
    private val devices: DeviceRepository,
) {
    fun replace(
        missionId: UUID,
        deviceIds: Set<UUID>,
    ) {
        jdbc.sql("DELETE FROM assignment WHERE mission_id = :missionId").param("missionId", missionId).update()
        deviceIds.forEach {
            jdbc
                .sql("INSERT INTO assignment (mission_id, device_id) VALUES (:missionId, :deviceId)")
                .param("missionId", missionId)
                .param("deviceId", it)
                .update()
        }
    }

    fun devices(missionId: UUID): List<Device> =
        jdbc
            .sql("SELECT d.* FROM device d JOIN assignment a ON a.device_id = d.id WHERE a.mission_id = :missionId ORDER BY d.name, d.id")
            .param("missionId", missionId)
            .query { rs, _ -> devices.map(rs) }
            .list()
}
```

`server/src/main/kotlin/geomap/server/device/DeviceService.kt`:

```kotlin
package geomap.server.device

import geomap.server.audit.AuditEvent
import geomap.server.audit.AuditRepository
import geomap.server.mission.MissionService
import geomap.server.security.Actor
import geomap.server.security.Pem
import geomap.server.web.ConflictException
import geomap.server.web.ForbiddenException
import geomap.server.web.InvalidInputException
import geomap.server.web.NotFoundException
import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.interfaces.RSAPublicKey
import java.time.Clock
import java.util.Base64
import java.util.UUID

data class DeviceRegistration(
    val name: String,
    val certSha256: String,
    val encryptionPublicKeyPem: String,
)

data class Assignment(
    val deviceIds: Set<UUID>,
)

@Service
class DeviceService(
    private val devices: DeviceRepository,
    private val assignments: AssignmentRepository,
    private val missions: MissionService,
    private val audit: AuditRepository,
    private val clock: Clock,
) {
    fun list(): List<Device> = devices.findAll()

    @Transactional
    fun register(
        actor: Actor,
        registration: DeviceRegistration,
    ): Device {
        val name = registration.name.trim()
        if (name.length !in 1..100) throw InvalidInputException("name must be 1 to 100 characters")
        if (!FINGERPRINT.matches(registration.certSha256)) throw InvalidInputException("certSha256 must be 64 lowercase hex characters")
        val key =
            runCatching { Pem.publicKey(registration.encryptionPublicKeyPem, "RSA") as RSAPublicKey }
                .getOrNull()
                ?.takeIf { it.modulus.bitLength() >= MIN_RSA_BITS }
                ?: throw InvalidInputException("the encryption key must be RSA with at least $MIN_RSA_BITS bits")
        val now = clock.instant()
        val device =
            Device(UUID.randomUUID(), name, registration.certSha256, Base64.getEncoder().encodeToString(key.encoded), DeviceStatus.ENROLLED, null, now)
        try {
            devices.insert(device)
        } catch (e: DuplicateKeyException) {
            throw ConflictException("a device with this certificate is already registered")
        }
        audit.record(AuditEvent(now, actor.user, actor.agent, "device.register", "device:${device.id}", emptyMap()))
        return device
    }

    @Transactional
    fun revoke(
        actor: Actor,
        id: UUID,
    ): Device {
        val device = devices.find(id) ?: throw NotFoundException("device not found")
        devices.updateStatus(id, DeviceStatus.REVOKED)
        audit.record(AuditEvent(clock.instant(), actor.user, actor.agent, "device.revoke", "device:$id", emptyMap()))
        return device.copy(status = DeviceStatus.REVOKED)
    }

    fun assigned(missionId: UUID): List<Device> {
        missions.get(missionId)
        return assignments.devices(missionId)
    }

    @Transactional
    fun assign(
        actor: Actor,
        missionId: UUID,
        deviceIds: Set<UUID>,
    ): List<Device> {
        if (actor.isAgent) throw ForbiddenException("only a human can assign devices")
        missions.editable(missionId)
        deviceIds.forEach { id ->
            if (devices.find(id)?.status != DeviceStatus.ENROLLED) throw InvalidInputException("device $id is not enrolled")
        }
        assignments.replace(missionId, deviceIds)
        audit.record(AuditEvent(clock.instant(), actor.user, actor.agent, "mission.assign", "mission:$missionId", mapOf("devices" to deviceIds.size)))
        return assignments.devices(missionId)
    }

    private companion object {
        val FINGERPRINT = Regex("^[0-9a-f]{64}$")
        const val MIN_RSA_BITS = 3072
    }
}
```

`server/src/main/kotlin/geomap/server/device/DeviceController.kt`:

```kotlin
package geomap.server.device

import geomap.server.security.Actor
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class DeviceController(
    private val service: DeviceService,
) {
    @PostMapping("/api/devices")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('administrateur')")
    fun register(
        @RequestBody registration: DeviceRegistration,
        authentication: Authentication,
    ): DeviceView = service.register(Actor.of(authentication), registration).view()

    @GetMapping("/api/devices")
    @PreAuthorize("hasRole('administrateur')")
    fun list(): List<DeviceView> = service.list().map { it.view() }

    @PostMapping("/api/devices/{id}/revoke")
    @PreAuthorize("hasRole('administrateur')")
    fun revoke(
        @PathVariable id: UUID,
        authentication: Authentication,
    ): DeviceView = service.revoke(Actor.of(authentication), id).view()

    @PutMapping("/api/missions/{missionId}/devices")
    @PreAuthorize("hasRole('planificateur')")
    fun assign(
        @PathVariable missionId: UUID,
        @RequestBody assignment: Assignment,
        authentication: Authentication,
    ): List<DeviceView> = service.assign(Actor.of(authentication), missionId, assignment.deviceIds).map { it.view() }

    @GetMapping("/api/missions/{missionId}/devices")
    @PreAuthorize("hasRole('planificateur')")
    fun assigned(
        @PathVariable missionId: UUID,
    ): List<DeviceView> = service.assigned(missionId).map { it.view() }
}
```

- [ ] **Step 5: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `DeviceApiTest` (5), `AssignmentApiTest` (6) and all earlier tests pass.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): register devices and assign them to missions"
```
