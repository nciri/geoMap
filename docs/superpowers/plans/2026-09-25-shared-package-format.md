# Shared Mission Package Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `shared/`, the Kotlin/JVM library that builds, encrypts, signs, verifies and decrypts geoMap mission packages (`.gmp`) and signs basemaps, used by both the server and the Android app.

**Architecture:** A standalone Gradle build in `shared/` (the server and Android builds will consume it later with `includeBuild("../shared")`). Pure JVM code using only `java.*`/`javax.*` crypto APIs available on Android API 29, plus `kotlinx-serialization-json`. The server calls `PackageBuilder`; the device calls `PackageVerifier`, supplying a `KeyUnwrapper` so the private key can stay in the Android Keystore.

**Tech Stack:** Kotlin 2.2.20, Gradle 8.14.3 (wrapper), JVM toolchain 17, kotlinx-serialization-json 1.9.0, kotlin-test + JUnit 5, ktlint Gradle plugin 12.1.2.

**Spec:** `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` (sections 6, 7, 12)

**Plan series:** this is plan 1 of 5 for sub-project 1 (shared → server → web → android → helm + end-to-end). Each later plan is written after the previous one is merged.

## Global Constraints

- Minimum Android version: Android 10 (API 29). `shared/` must not use any API unavailable there, and must not depend on Android.
- Only runtime dependency: `kotlinx-serialization-json` (mobile size budget: APK arm64 < 25 Mo).
- Payload encryption: AES-256-GCM, random key per package. Server signature: ECDSA P-256 (`SHA256withECDSA`).
- Key wrapping: RSA-OAEP with SHA-256 digest and MGF1-SHA1 (only MGF1 digest supported by the Android Keystore below API 34). Device decryption key: RSA-3072, separate from the mTLS key.
- Zoom bands: `features/z0-10.geojson`, `features/z11-14.geojson`, `features/z15-22.geojson`; icons `icons/<sha256-hex>.png`; `summary.md`.
- Dates are ISO 8601 UTC strings (`2026-09-25T08:00:00Z`).
- Logs never contain keys or mission content (this library does not log).
- Package root name: `geomap.pkg`. Conventional Commits. No AI attribution in commit messages.
- Quality gate: `make check` (ktlint + tests) must pass before a task is done.

## Review Focus

- A package file whose copy or download was interrupted (truncated at any byte) must be rejected as `MALFORMED`, never crash or partially import. (Task 4 truncation loop, Task 6 truncated test.)
- Importing the same package twice from an SD card must be rejected as `NOT_NEWER`, leaving the installed version intact. (Task 6.)
- One altered byte anywhere in manifest, payload or signature must yield `BAD_SIGNATURE`. (Task 6.)
- A mission whose `validUntil` equals the device clock must count as expired. (Task 6 boundary test.)
- A payload archive with a path-traversal entry, an unknown entry or an oversized entry must be rejected. (Task 2.)

## File Structure

| File | Responsibility |
|---|---|
| `Makefile` | `make check` quality gate for the repo |
| `.gitignore` | Build outputs, IDE files |
| `shared/settings.gradle.kts`, `shared/build.gradle.kts` | Standalone Gradle build |
| `shared/src/main/kotlin/geomap/pkg/Manifest.kt` | Manifest data model + JSON codec |
| `shared/src/main/kotlin/geomap/pkg/MissionPayload.kt` | Payload model + zip codec |
| `shared/src/main/kotlin/geomap/pkg/Crypto.kt` | SHA-256, Base64, AES-GCM, RSA-OAEP, ECDSA, `KeyUnwrapper` |
| `shared/src/main/kotlin/geomap/pkg/GmpContainer.kt` | Binary framing of a `.gmp` file |
| `shared/src/main/kotlin/geomap/pkg/PackageBuilder.kt` | Server side: build an encrypted, signed package |
| `shared/src/main/kotlin/geomap/pkg/PackageVerifier.kt` | Device side: verify and decrypt, with typed rejections |
| `shared/src/main/kotlin/geomap/pkg/BasemapSignature.kt` | Sign/verify large basemap files (streaming) |
| `shared/src/test/kotlin/geomap/pkg/*Test.kt` | One test file per source file, plus `TestKeys.kt` |

---

### Task 1: Gradle build and manifest model

**Files:**
- Create: `.gitignore`, `Makefile`, `shared/settings.gradle.kts`, `shared/build.gradle.kts`
- Create: `shared/src/main/kotlin/geomap/pkg/Manifest.kt`
- Test: `shared/src/test/kotlin/geomap/pkg/ManifestJsonTest.kt`

**Interfaces:**
- Produces: `Manifest(format: Int = 1, missionId: String, version: Int, createdAt: String, validUntil: String, basemap: BasemapRef, payload: PayloadInfo, recipients: List<Recipient>)`, `BasemapRef(id: String, sha256: String)`, `PayloadInfo(alg: String, iv: String, sha256: String)`, `Recipient(deviceCertSha256: String, alg: String, wrappedKey: String)`, `ManifestJson.encode(Manifest): ByteArray`, `ManifestJson.decode(ByteArray): Manifest` (throws `kotlinx.serialization.SerializationException`, a subclass of `IllegalArgumentException`).

- [ ] **Step 1: Create the build files**

`.gitignore`:

```gitignore
.gradle/
build/
.idea/
*.iml
local.properties
.kotlin/
```

`Makefile` (the recipe line must start with a TAB character):

```makefile
.PHONY: check
check:
	cd shared && ./gradlew check
```

`shared/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

rootProject.name = "geomap-shared"
```

`shared/build.gradle.kts`:

```kotlin
plugins {
    `java-library`
    kotlin("jvm") version "2.2.20"
    kotlin("plugin.serialization") version "2.2.20"
    id("org.jlleitschuh.gradle.ktlint") version "12.1.2"
}

group = "geomap"
version = "0.1.0"

kotlin {
    jvmToolchain(17)
}

dependencies {
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}
```

- [ ] **Step 2: Generate the Gradle wrapper from the locally cached distribution**

Run:

```bash
GRADLE_BIN=$(ls -d ~/.gradle/wrapper/dists/gradle-8.14.3-bin/*/gradle-8.14.3/bin/gradle | head -1)
cd shared && "$GRADLE_BIN" wrapper --gradle-version 8.14.3
```

Expected: `shared/gradlew`, `shared/gradlew.bat`, `shared/gradle/wrapper/` created, `BUILD SUCCESSFUL`.

- [ ] **Step 3: Write the failing test**

`shared/src/test/kotlin/geomap/pkg/ManifestJsonTest.kt`:

```kotlin
package geomap.pkg

import kotlinx.serialization.SerializationException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ManifestJsonTest {
    private val sample =
        Manifest(
            missionId = "m-1",
            version = 3,
            createdAt = "2026-09-25T08:00:00Z",
            validUntil = "2026-10-02T00:00:00Z",
            basemap = BasemapRef(id = "zone-nord", sha256 = "ab"),
            payload = PayloadInfo(alg = "A256GCM", iv = "aXY=", sha256 = "00"),
            recipients = listOf(Recipient(deviceCertSha256 = "cafe", alg = "RSA-OAEP-SHA256-MGF1SHA1", wrappedKey = "a2V5")),
        )

    @Test
    fun `round trips a manifest`() {
        assertEquals(sample, ManifestJson.decode(ManifestJson.encode(sample)))
    }

    @Test
    fun `always writes the format number`() {
        assertTrue(ManifestJson.encode(sample).decodeToString().contains("\"format\":1"))
    }

    @Test
    fun `rejects unknown fields`() {
        val json = ManifestJson.encode(sample).decodeToString().replaceFirst("{", "{\"extra\":1,")
        assertFailsWith<SerializationException> { ManifestJson.decode(json.encodeToByteArray()) }
    }

    @Test
    fun `rejects a manifest missing a field`() {
        val json = """{"format":1,"missionId":"m-1"}"""
        assertFailsWith<SerializationException> { ManifestJson.decode(json.encodeToByteArray()) }
    }
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd shared && ./gradlew test --tests geomap.pkg.ManifestJsonTest`
Expected: FAIL, compilation error `Unresolved reference 'Manifest'`.

- [ ] **Step 5: Write the implementation**

`shared/src/main/kotlin/geomap/pkg/Manifest.kt`:

```kotlin
package geomap.pkg

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class Manifest(
    val format: Int = 1,
    val missionId: String,
    val version: Int,
    val createdAt: String,
    val validUntil: String,
    val basemap: BasemapRef,
    val payload: PayloadInfo,
    val recipients: List<Recipient>,
)

@Serializable
data class BasemapRef(
    val id: String,
    val sha256: String,
)

@Serializable
data class PayloadInfo(
    val alg: String,
    val iv: String,
    val sha256: String,
)

@Serializable
data class Recipient(
    val deviceCertSha256: String,
    val alg: String,
    val wrappedKey: String,
)

object ManifestJson {
    // Unknown fields are rejected: a newer format must bump `format`, not slip past an old reader.
    private val json = Json { encodeDefaults = true }

    fun encode(manifest: Manifest): ByteArray = json.encodeToString(Manifest.serializer(), manifest).encodeToByteArray()

    fun decode(bytes: ByteArray): Manifest = json.decodeFromString(Manifest.serializer(), bytes.decodeToString())
}
```

- [ ] **Step 6: Run the quality gate**

Run: `cd shared && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`, 4 tests passed.

- [ ] **Step 7: Commit**

```bash
git add .gitignore Makefile shared
git commit -m "feat(shared): add Gradle build and mission manifest model"
```

---

### Task 2: Payload model and zip codec

**Files:**
- Create: `shared/src/main/kotlin/geomap/pkg/MissionPayload.kt`
- Test: `shared/src/test/kotlin/geomap/pkg/PayloadCodecTest.kt`

**Interfaces:**
- Produces: `enum class ZoomBand(val entryName: String) { LOW, MID, HIGH }`, `MissionPayload(features: Map<ZoomBand, String>, icons: Map<String, ByteArray>, summary: String)` (icon keys are `<64 hex>.png`), `PayloadCodec.encode(MissionPayload): ByteArray`, `PayloadCodec.decode(ByteArray, maxUncompressed: Long = PayloadCodec.MAX_UNCOMPRESSED): MissionPayload` (throws `IllegalArgumentException` on any invalid archive), `PayloadCodec.EMPTY_FEATURE_COLLECTION`.

- [ ] **Step 1: Write the failing test**

`shared/src/test/kotlin/geomap/pkg/PayloadCodecTest.kt`:

```kotlin
package geomap.pkg

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class PayloadCodecTest {
    private val iconName = "a".repeat(64) + ".png"
    private val payload =
        MissionPayload(
            features =
                mapOf(
                    ZoomBand.LOW to """{"type":"FeatureCollection","features":[{"id":1}]}""",
                    ZoomBand.MID to """{"type":"FeatureCollection","features":[{"id":2}]}""",
                    ZoomBand.HIGH to """{"type":"FeatureCollection","features":[{"id":3}]}""",
                ),
            icons = mapOf(iconName to byteArrayOf(1, 2, 3)),
            summary = "Reconnaissance secteur nord",
        )

    private fun zipOf(vararg entries: Pair<String, ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            entries.forEach { (name, bytes) ->
                zip.putNextEntry(ZipEntry(name))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        return out.toByteArray()
    }

    private val validEntries =
        arrayOf(
            ZoomBand.LOW.entryName to "{}".encodeToByteArray(),
            ZoomBand.MID.entryName to "{}".encodeToByteArray(),
            ZoomBand.HIGH.entryName to "{}".encodeToByteArray(),
            "summary.md" to "s".encodeToByteArray(),
        )

    @Test
    fun `round trips a payload`() {
        val decoded = PayloadCodec.decode(PayloadCodec.encode(payload))
        assertEquals(payload.features, decoded.features)
        assertEquals(payload.summary, decoded.summary)
        assertEquals(setOf(iconName), decoded.icons.keys)
        assertContentEquals(byteArrayOf(1, 2, 3), decoded.icons.getValue(iconName))
    }

    @Test
    fun `fills missing zoom bands with an empty feature collection`() {
        val decoded = PayloadCodec.decode(PayloadCodec.encode(payload.copy(features = mapOf(ZoomBand.LOW to "{}"))))
        assertEquals(PayloadCodec.EMPTY_FEATURE_COLLECTION, decoded.features.getValue(ZoomBand.MID))
    }

    @Test
    fun `refuses to encode an icon with an invalid name`() {
        assertFailsWith<IllegalArgumentException> {
            PayloadCodec.encode(payload.copy(icons = mapOf("../evil.png" to byteArrayOf(1))))
        }
    }

    @Test
    fun `rejects a path traversal entry`() {
        assertFailsWith<IllegalArgumentException> {
            PayloadCodec.decode(zipOf(*validEntries, "../evil" to byteArrayOf(1)))
        }
    }

    @Test
    fun `rejects an unknown entry`() {
        assertFailsWith<IllegalArgumentException> {
            PayloadCodec.decode(zipOf(*validEntries, "notes.txt" to byteArrayOf(1)))
        }
    }

    @Test
    fun `rejects an archive without summary`() {
        assertFailsWith<IllegalArgumentException> {
            PayloadCodec.decode(zipOf(*validEntries.dropLast(1).toTypedArray()))
        }
    }

    @Test
    fun `rejects an archive larger than the limit once uncompressed`() {
        assertFailsWith<IllegalArgumentException> {
            PayloadCodec.decode(PayloadCodec.encode(payload), maxUncompressed = 10)
        }
    }

    @Test
    fun `rejects bytes that are not a zip`() {
        assertFailsWith<IllegalArgumentException> { PayloadCodec.decode(byteArrayOf(1, 2, 3)) }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && ./gradlew test --tests geomap.pkg.PayloadCodecTest`
Expected: FAIL, compilation error `Unresolved reference 'MissionPayload'`.

- [ ] **Step 3: Write the implementation**

`shared/src/main/kotlin/geomap/pkg/MissionPayload.kt`:

```kotlin
package geomap.pkg

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipException
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

enum class ZoomBand(
    val entryName: String,
) {
    LOW("features/z0-10.geojson"),
    MID("features/z11-14.geojson"),
    HIGH("features/z15-22.geojson"),
}

data class MissionPayload(
    val features: Map<ZoomBand, String>,
    val icons: Map<String, ByteArray>,
    val summary: String,
)

object PayloadCodec {
    const val EMPTY_FEATURE_COLLECTION = """{"type":"FeatureCollection","features":[]}"""
    const val MAX_UNCOMPRESSED: Long = 64L * 1024 * 1024
    private const val SUMMARY = "summary.md"
    private val ICON_NAME = Regex("^[0-9a-f]{64}\\.png$")

    fun encode(payload: MissionPayload): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            ZoomBand.entries.forEach { band ->
                zip.put(band.entryName, (payload.features[band] ?: EMPTY_FEATURE_COLLECTION).encodeToByteArray())
            }
            payload.icons.toSortedMap().forEach { (name, bytes) ->
                require(ICON_NAME.matches(name)) { "invalid icon name" }
                zip.put("icons/$name", bytes)
            }
            zip.put(SUMMARY, payload.summary.encodeToByteArray())
        }
        return out.toByteArray()
    }

    fun decode(
        bytes: ByteArray,
        maxUncompressed: Long = MAX_UNCOMPRESSED,
    ): MissionPayload {
        val features = mutableMapOf<ZoomBand, String>()
        val icons = mutableMapOf<String, ByteArray>()
        var summary: String? = null
        var remaining = maxUncompressed
        try {
            ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    val data = zip.readAtMost(remaining)
                    remaining -= data.size
                    val band = ZoomBand.entries.find { it.entryName == entry.name }
                    val iconName = entry.name.removePrefix("icons/")
                    when {
                        band != null -> features[band] = data.decodeToString()
                        entry.name.startsWith("icons/") && ICON_NAME.matches(iconName) -> icons[iconName] = data
                        entry.name == SUMMARY -> summary = data.decodeToString()
                        else -> throw IllegalArgumentException("unexpected entry")
                    }
                }
            }
        } catch (e: ZipException) {
            throw IllegalArgumentException("invalid archive", e)
        }
        require(features.keys == ZoomBand.entries.toSet()) { "missing zoom band" }
        return MissionPayload(features, icons, summary ?: throw IllegalArgumentException("missing summary"))
    }

    private fun ZipOutputStream.put(
        name: String,
        bytes: ByteArray,
    ) {
        putNextEntry(ZipEntry(name))
        write(bytes)
        closeEntry()
    }

    private fun InputStream.readAtMost(limit: Long): ByteArray {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val read = read(buffer)
            if (read < 0) break
            require(out.size() + read <= limit) { "archive too large" }
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }
}
```

Note: bytes that are not a zip produce no entries, so `decode` fails on the `missing zoom band` check with `IllegalArgumentException`.

- [ ] **Step 4: Run the quality gate**

Run: `cd shared && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`, all tests pass (4 + 8).

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): add mission payload zip codec"
```

---

### Task 3: Crypto primitives

**Files:**
- Create: `shared/src/main/kotlin/geomap/pkg/Crypto.kt`
- Create: `shared/src/test/kotlin/geomap/pkg/TestKeys.kt`
- Test: `shared/src/test/kotlin/geomap/pkg/CryptoTest.kt`
- Modify: `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` (section 6.2, key-wrap algorithm name)

**Interfaces:**
- Produces:
  - `fun ByteArray.toHex(): String`, `fun b64(bytes: ByteArray): String`, `fun unb64(text: String): ByteArray` (throws `IllegalArgumentException`)
  - `Sha256.hex(ByteArray): String`, `Sha256.bytesOf(Path): ByteArray` (streaming)
  - `Aes.ALG = "A256GCM"`, `Aes.newKey(): ByteArray`, `Aes.newIv(): ByteArray`, `Aes.encrypt(key, iv, plaintext, aad): ByteArray`, `Aes.decrypt(key, iv, ciphertext, aad): ByteArray` (throws `javax.crypto.AEADBadTagException` on tampering)
  - `RsaOaep.ALG = "RSA-OAEP-SHA256-MGF1SHA1"`, `RsaOaep.TRANSFORMATION`, `RsaOaep.PARAMS`, `RsaOaep.wrap(key: ByteArray, recipient: PublicKey): ByteArray`
  - `fun interface KeyUnwrapper { fun unwrap(wrapped: ByteArray): ByteArray }`, `class SoftwareKeyUnwrapper(privateKey: PrivateKey) : KeyUnwrapper`
  - `Ecdsa.sign(data: ByteArray, key: PrivateKey): ByteArray`, `Ecdsa.verify(data: ByteArray, signature: ByteArray, key: PublicKey): Boolean` (never throws on a bad signature)
  - Test only: `TestKeys.rsa`, `TestKeys.rsaOther` (RSA-3072 `KeyPair`), `TestKeys.ec`, `TestKeys.ecOther` (EC P-256 `KeyPair`)

- [ ] **Step 1: Write the test keys helper**

`shared/src/test/kotlin/geomap/pkg/TestKeys.kt`:

```kotlin
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

    private fun ecPair(): KeyPair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
}
```

- [ ] **Step 2: Write the failing test**

`shared/src/test/kotlin/geomap/pkg/CryptoTest.kt`:

```kotlin
package geomap.pkg

import java.nio.file.Files
import java.security.GeneralSecurityException
import javax.crypto.AEADBadTagException
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CryptoTest {
    private val data = "mission".encodeToByteArray()
    private val aad = "m-1:1".encodeToByteArray()

    @Test
    fun `sha256 matches the known vector`() {
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            Sha256.hex("abc".encodeToByteArray()),
        )
    }

    @Test
    fun `sha256 of a file matches sha256 of its bytes`() {
        val file = Files.createTempFile("basemap", ".pmtiles")
        Files.write(file, ByteArray(100_000) { it.toByte() })
        assertEquals(Sha256.hex(Files.readAllBytes(file)), Sha256.bytesOf(file).toHex())
    }

    @Test
    fun `base64 round trips and rejects garbage`() {
        assertContentEquals(data, unb64(b64(data)))
        assertFailsWith<IllegalArgumentException> { unb64("%%%") }
    }

    @Test
    fun `aes round trips`() {
        val key = Aes.newKey()
        val iv = Aes.newIv()
        assertContentEquals(data, Aes.decrypt(key, iv, Aes.encrypt(key, iv, data, aad), aad))
    }

    @Test
    fun `aes detects a tampered ciphertext`() {
        val key = Aes.newKey()
        val iv = Aes.newIv()
        val cipher = Aes.encrypt(key, iv, data, aad)
        cipher[0] = (cipher[0].toInt() xor 1).toByte()
        assertFailsWith<AEADBadTagException> { Aes.decrypt(key, iv, cipher, aad) }
    }

    @Test
    fun `aes detects a different associated data`() {
        val key = Aes.newKey()
        val iv = Aes.newIv()
        val cipher = Aes.encrypt(key, iv, data, aad)
        assertFailsWith<AEADBadTagException> { Aes.decrypt(key, iv, cipher, "m-1:2".encodeToByteArray()) }
    }

    @Test
    fun `rsa oaep wraps and unwraps a key`() {
        val key = Aes.newKey()
        val wrapped = RsaOaep.wrap(key, TestKeys.rsa.public)
        assertContentEquals(key, SoftwareKeyUnwrapper(TestKeys.rsa.private).unwrap(wrapped))
    }

    @Test
    fun `rsa oaep unwrap fails with another private key`() {
        val wrapped = RsaOaep.wrap(Aes.newKey(), TestKeys.rsa.public)
        assertFailsWith<GeneralSecurityException> { SoftwareKeyUnwrapper(TestKeys.rsaOther.private).unwrap(wrapped) }
    }

    @Test
    fun `ecdsa verifies its own signature`() {
        assertTrue(Ecdsa.verify(data, Ecdsa.sign(data, TestKeys.ec.private), TestKeys.ec.public))
    }

    @Test
    fun `ecdsa rejects altered data, another key and garbage`() {
        val signature = Ecdsa.sign(data, TestKeys.ec.private)
        assertFalse(Ecdsa.verify("other".encodeToByteArray(), signature, TestKeys.ec.public))
        assertFalse(Ecdsa.verify(data, signature, TestKeys.ecOther.public))
        assertFalse(Ecdsa.verify(data, byteArrayOf(1, 2, 3), TestKeys.ec.public))
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd shared && ./gradlew test --tests geomap.pkg.CryptoTest`
Expected: FAIL, compilation error `Unresolved reference 'Sha256'`.

- [ ] **Step 4: Write the implementation**

`shared/src/main/kotlin/geomap/pkg/Crypto.kt`:

```kotlin
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
        }
}
```

- [ ] **Step 5: Run the quality gate**

Run: `cd shared && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`, all tests pass.

- [ ] **Step 6: Align the spec with the key-wrap algorithm**

In `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md`, section 6.2:

- replace `"alg": "RSA-OAEP-256"` with `"alg": "RSA-OAEP-SHA256-MGF1SHA1"` in the manifest example;
- replace the sentence starting `Avec Android 10 minimum, le terminal utilise une paire RSA-3072 dédiée au déchiffrement (OAEP SHA-256)` with:

```markdown
Avec Android 10 minimum, le terminal utilise une paire RSA-3072 dédiée au déchiffrement (OAEP, empreinte SHA-256, MGF1-SHA1 : seul MGF1 accepté par l'Android Keystore avant l'API 34), distincte de la paire servant au certificat mTLS.
```

- [ ] **Step 7: Commit**

```bash
git add shared docs/superpowers/specs
git commit -m "feat(shared): add AES-GCM, RSA-OAEP and ECDSA primitives"
```

---

### Task 4: Binary container

**Files:**
- Create: `shared/src/main/kotlin/geomap/pkg/GmpContainer.kt`
- Test: `shared/src/test/kotlin/geomap/pkg/GmpContainerTest.kt`
- Modify: `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` (section 6.2, framing and signature scope)

**Interfaces:**
- Produces: `class GmpContainer(manifest: ByteArray, payload: ByteArray, signature: ByteArray, signedPart: ByteArray)`, `GmpContainer.encodeUnsigned(manifest: ByteArray, payload: ByteArray): ByteArray`, `GmpContainer.appendSignature(unsigned: ByteArray, signature: ByteArray): ByteArray`, `GmpContainer.decode(bytes: ByteArray): GmpContainer` (throws `IllegalArgumentException` on any malformed input). `signedPart` is every byte before the signature length field.

Layout: `"GMP1"` | manifest length (int32 BE) | manifest | payload length (int32 BE) | payload | signature length (uint16 BE) | signature.

- [ ] **Step 1: Write the failing test**

`shared/src/test/kotlin/geomap/pkg/GmpContainerTest.kt`:

```kotlin
package geomap.pkg

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertFailsWith

class GmpContainerTest {
    private val manifest = """{"format":1}""".encodeToByteArray()
    private val payload = ByteArray(300) { it.toByte() }
    private val signature = ByteArray(70) { 7 }
    private val unsigned = GmpContainer.encodeUnsigned(manifest, payload)
    private val encoded = GmpContainer.appendSignature(unsigned, signature)

    @Test
    fun `round trips all parts`() {
        val decoded = GmpContainer.decode(encoded)
        assertContentEquals(manifest, decoded.manifest)
        assertContentEquals(payload, decoded.payload)
        assertContentEquals(signature, decoded.signature)
        assertContentEquals(unsigned, decoded.signedPart)
    }

    @Test
    fun `rejects a wrong magic`() {
        val bad = encoded.copyOf().also { it[0] = 'X'.code.toByte() }
        assertFailsWith<IllegalArgumentException> { GmpContainer.decode(bad) }
    }

    @Test
    fun `rejects every truncation`() {
        for (length in 0 until encoded.size) {
            assertFailsWith<IllegalArgumentException>("length $length") { GmpContainer.decode(encoded.copyOf(length)) }
        }
    }

    @Test
    fun `rejects trailing bytes`() {
        assertFailsWith<IllegalArgumentException> { GmpContainer.decode(encoded + byteArrayOf(0)) }
    }

    @Test
    fun `rejects an oversized manifest length`() {
        val out = ByteArrayOutputStream()
        DataOutputStream(out).use {
            it.write("GMP1".encodeToByteArray())
            it.writeInt(Int.MAX_VALUE)
        }
        assertFailsWith<IllegalArgumentException> { GmpContainer.decode(out.toByteArray()) }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && ./gradlew test --tests geomap.pkg.GmpContainerTest`
Expected: FAIL, compilation error `Unresolved reference 'GmpContainer'`.

- [ ] **Step 3: Write the implementation**

`shared/src/main/kotlin/geomap/pkg/GmpContainer.kt`:

```kotlin
package geomap.pkg

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException

class GmpContainer(
    val manifest: ByteArray,
    val payload: ByteArray,
    val signature: ByteArray,
    val signedPart: ByteArray,
) {
    companion object {
        private val MAGIC = "GMP1".encodeToByteArray()
        private const val MAX_MANIFEST = 64 * 1024
        private const val MAX_PAYLOAD = 64 * 1024 * 1024
        private const val MAX_SIGNATURE = 512

        fun encodeUnsigned(
            manifest: ByteArray,
            payload: ByteArray,
        ): ByteArray {
            val out = ByteArrayOutputStream()
            DataOutputStream(out).use {
                it.write(MAGIC)
                it.writeInt(manifest.size)
                it.write(manifest)
                it.writeInt(payload.size)
                it.write(payload)
            }
            return out.toByteArray()
        }

        fun appendSignature(
            unsigned: ByteArray,
            signature: ByteArray,
        ): ByteArray {
            val out = ByteArrayOutputStream()
            DataOutputStream(out).use {
                it.write(unsigned)
                it.writeShort(signature.size)
                it.write(signature)
            }
            return out.toByteArray()
        }

        fun decode(bytes: ByteArray): GmpContainer {
            val input = DataInputStream(ByteArrayInputStream(bytes))
            try {
                val magic = ByteArray(MAGIC.size).also(input::readFully)
                require(magic.contentEquals(MAGIC)) { "bad magic" }
                val manifestLength = input.readInt()
                require(manifestLength in 1..MAX_MANIFEST) { "bad manifest length" }
                val manifest = ByteArray(manifestLength).also(input::readFully)
                val payloadLength = input.readInt()
                require(payloadLength in 0..MAX_PAYLOAD) { "bad payload length" }
                val payload = ByteArray(payloadLength).also(input::readFully)
                val signedLength = MAGIC.size + 4 + manifestLength + 4 + payloadLength
                val signatureLength = input.readUnsignedShort()
                require(signatureLength in 1..MAX_SIGNATURE) { "bad signature length" }
                val signature = ByteArray(signatureLength).also(input::readFully)
                require(input.read() == -1) { "trailing bytes" }
                return GmpContainer(manifest, payload, signature, bytes.copyOf(signedLength))
            } catch (e: EOFException) {
                throw IllegalArgumentException("truncated package", e)
            }
        }
    }
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd shared && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`, all tests pass.

- [ ] **Step 5: Align the spec with the framing**

In `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md`, section 6.2, replace the container code block content with:

```
"GMP1" | longueur manifeste (int32) | manifeste (JSON UTF-8) | longueur charge (int32) | charge chiffrée | longueur signature (uint16) | signature
```

and replace the line starting `**Signature** : ECDSA P-256 du serveur, sur` with:

```markdown
**Signature** : ECDSA P-256 du serveur, sur tous les octets qui précèdent la longueur de signature (en-tête, manifeste, charge chiffrée). Signer l'en-tête empêche de déplacer la frontière entre manifeste et charge.
```

- [ ] **Step 6: Commit**

```bash
git add shared docs/superpowers/specs
git commit -m "feat(shared): add .gmp binary container framing"
```

---

### Task 5: Package builder (server side)

**Files:**
- Create: `shared/src/main/kotlin/geomap/pkg/PackageBuilder.kt`
- Test: `shared/src/test/kotlin/geomap/pkg/PackageBuilderTest.kt`

**Interfaces:**
- Consumes: `Manifest`, `ManifestJson` (Task 1); `MissionPayload`, `PayloadCodec` (Task 2); `Aes`, `RsaOaep`, `Ecdsa`, `Sha256`, `b64` (Task 3); `GmpContainer` (Task 4).
- Produces: `MissionHeader(missionId: String, version: Int, createdAt: Instant, validUntil: Instant, basemap: BasemapRef)`, `RecipientKey(deviceCertSha256: String, encryptionKey: PublicKey)`, `class PackageBuilder(signingKey: PrivateKey) { fun build(header: MissionHeader, payload: MissionPayload, recipients: List<RecipientKey>): ByteArray }`, `PackageBuilder.aad(missionId: String, version: Int): ByteArray`.

- [ ] **Step 1: Write the failing test**

`shared/src/test/kotlin/geomap/pkg/PackageBuilderTest.kt`:

```kotlin
package geomap.pkg

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class PackageBuilderTest {
    private val header =
        MissionHeader(
            missionId = "m-1",
            version = 2,
            createdAt = Instant.parse("2026-09-25T08:00:00Z"),
            validUntil = Instant.parse("2026-10-02T00:00:00Z"),
            basemap = BasemapRef("zone-nord", "aa"),
        )
    private val payload = MissionPayload(mapOf(ZoomBand.LOW to "{}"), emptyMap(), "Mission test")
    private val recipients =
        listOf(
            RecipientKey("cert-a", TestKeys.rsa.public),
            RecipientKey("cert-b", TestKeys.rsaOther.public),
        )

    private fun build() = PackageBuilder(TestKeys.ec.private).build(header, payload, recipients)

    @Test
    fun `writes the header into the manifest`() {
        val manifest = ManifestJson.decode(GmpContainer.decode(build()).manifest)
        assertEquals("m-1", manifest.missionId)
        assertEquals(2, manifest.version)
        assertEquals("2026-09-25T08:00:00Z", manifest.createdAt)
        assertEquals("2026-10-02T00:00:00Z", manifest.validUntil)
        assertEquals(BasemapRef("zone-nord", "aa"), manifest.basemap)
        assertEquals(Aes.ALG, manifest.payload.alg)
    }

    @Test
    fun `signs the package with the server key`() {
        val container = GmpContainer.decode(build())
        assertTrue(Ecdsa.verify(container.signedPart, container.signature, TestKeys.ec.public))
    }

    @Test
    fun `records the payload hash`() {
        val container = GmpContainer.decode(build())
        assertEquals(Sha256.hex(container.payload), ManifestJson.decode(container.manifest).payload.sha256)
    }

    @Test
    fun `every recipient can decrypt the payload`() {
        val container = GmpContainer.decode(build())
        val manifest = ManifestJson.decode(container.manifest)
        val privateKeys = mapOf("cert-a" to TestKeys.rsa.private, "cert-b" to TestKeys.rsaOther.private)
        assertEquals(2, manifest.recipients.size)
        manifest.recipients.forEach { recipient ->
            assertEquals(RsaOaep.ALG, recipient.alg)
            val key = SoftwareKeyUnwrapper(privateKeys.getValue(recipient.deviceCertSha256)).unwrap(unb64(recipient.wrappedKey))
            val plain = Aes.decrypt(key, unb64(manifest.payload.iv), container.payload, PackageBuilder.aad("m-1", 2))
            assertEquals("Mission test", PayloadCodec.decode(plain).summary)
        }
    }

    @Test
    fun `refuses a package without recipients`() {
        assertFailsWith<IllegalArgumentException> {
            PackageBuilder(TestKeys.ec.private).build(header, payload, emptyList())
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && ./gradlew test --tests geomap.pkg.PackageBuilderTest`
Expected: FAIL, compilation error `Unresolved reference 'MissionHeader'`.

- [ ] **Step 3: Write the implementation**

`shared/src/main/kotlin/geomap/pkg/PackageBuilder.kt`:

```kotlin
package geomap.pkg

import java.security.PrivateKey
import java.security.PublicKey
import java.time.Instant

data class MissionHeader(
    val missionId: String,
    val version: Int,
    val createdAt: Instant,
    val validUntil: Instant,
    val basemap: BasemapRef,
)

data class RecipientKey(
    val deviceCertSha256: String,
    val encryptionKey: PublicKey,
)

class PackageBuilder(
    private val signingKey: PrivateKey,
) {
    fun build(
        header: MissionHeader,
        payload: MissionPayload,
        recipients: List<RecipientKey>,
    ): ByteArray {
        require(recipients.isNotEmpty()) { "a package needs at least one recipient" }
        val key = Aes.newKey()
        val iv = Aes.newIv()
        val ciphertext = Aes.encrypt(key, iv, PayloadCodec.encode(payload), aad(header.missionId, header.version))
        val manifest =
            Manifest(
                missionId = header.missionId,
                version = header.version,
                createdAt = header.createdAt.toString(),
                validUntil = header.validUntil.toString(),
                basemap = header.basemap,
                payload = PayloadInfo(alg = Aes.ALG, iv = b64(iv), sha256 = Sha256.hex(ciphertext)),
                recipients =
                    recipients.map {
                        Recipient(it.deviceCertSha256, RsaOaep.ALG, b64(RsaOaep.wrap(key, it.encryptionKey)))
                    },
            )
        val unsigned = GmpContainer.encodeUnsigned(ManifestJson.encode(manifest), ciphertext)
        return GmpContainer.appendSignature(unsigned, Ecdsa.sign(unsigned, signingKey))
    }

    companion object {
        // Binds the ciphertext to its mission and version, so a payload cannot be replayed under another header.
        fun aad(
            missionId: String,
            version: Int,
        ): ByteArray = "$missionId:$version".encodeToByteArray()
    }
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd shared && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): add encrypted and signed package builder"
```

---

### Task 6: Package verifier (device side)

**Files:**
- Create: `shared/src/main/kotlin/geomap/pkg/PackageVerifier.kt`
- Test: `shared/src/test/kotlin/geomap/pkg/PackageVerifierTest.kt`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces:
  - `enum class Rejection { MALFORMED, BAD_SIGNATURE, EXPIRED, NOT_NEWER, NOT_A_RECIPIENT, BASEMAP_MISSING, CORRUPTED }`
  - `sealed interface VerifyResult { data class Accepted(manifest: Manifest, payload: MissionPayload); data class Rejected(reason: Rejection) }`
  - `class VerifyContext(deviceCertSha256: String, unwrapper: KeyUnwrapper, serverSigningKey: PublicKey, now: Instant, installedVersion: (missionId: String) -> Int?, hasBasemap: (BasemapRef) -> Boolean)`
  - `PackageVerifier.verify(bytes: ByteArray, context: VerifyContext): VerifyResult` (never throws for bad input)
- Android UI mapping (for the Android plan): `MALFORMED`/`BAD_SIGNATURE`/`CORRUPTED` → « paquet invalide ou altéré », `NOT_A_RECIPIENT` → « paquet destiné à un autre terminal », `EXPIRED` → « mission expirée », `BASEMAP_MISSING` → « fond de carte manquant, synchronisez sur le Wi-Fi du PC », `NOT_NEWER` → « version déjà installée ».

Check order: framing → signature (nothing unsigned is trusted) → manifest parsing → algorithms → expiry → version → recipient → basemap → decryption.

- [ ] **Step 1: Write the failing test**

`shared/src/test/kotlin/geomap/pkg/PackageVerifierTest.kt`:

```kotlin
package geomap.pkg

import java.security.PrivateKey
import java.security.PublicKey
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class PackageVerifierTest {
    private val header =
        MissionHeader(
            missionId = "m-1",
            version = 2,
            createdAt = Instant.parse("2026-09-25T08:00:00Z"),
            validUntil = Instant.parse("2026-10-02T00:00:00Z"),
            basemap = BasemapRef("zone-nord", "aa"),
        )
    private val payload = MissionPayload(mapOf(ZoomBand.LOW to "{}"), emptyMap(), "Mission test")
    private val packageBytes =
        PackageBuilder(TestKeys.ec.private).build(
            header,
            payload,
            listOf(RecipientKey("cert-a", TestKeys.rsa.public), RecipientKey("cert-b", TestKeys.rsaOther.public)),
        )

    private fun context(
        now: Instant = Instant.parse("2026-09-26T00:00:00Z"),
        installed: Int? = null,
        hasBasemap: Boolean = true,
        cert: String = "cert-a",
        privateKey: PrivateKey = TestKeys.rsa.private,
        serverKey: PublicKey = TestKeys.ec.public,
    ) = VerifyContext(cert, SoftwareKeyUnwrapper(privateKey), serverKey, now, { installed }, { hasBasemap })

    private fun reasonOf(
        bytes: ByteArray,
        context: VerifyContext,
    ): Rejection = assertIs<VerifyResult.Rejected>(PackageVerifier.verify(bytes, context)).reason

    private fun flipped(index: Int) = packageBytes.copyOf().also { it[index] = (it[index].toInt() xor 1).toByte() }

    @Test
    fun `accepts a valid package`() {
        val accepted = assertIs<VerifyResult.Accepted>(PackageVerifier.verify(packageBytes, context()))
        assertEquals("m-1", accepted.manifest.missionId)
        assertEquals("Mission test", accepted.payload.summary)
    }

    @Test
    fun `every recipient can open the package`() {
        assertIs<VerifyResult.Accepted>(
            PackageVerifier.verify(packageBytes, context(cert = "cert-b", privateKey = TestKeys.rsaOther.private)),
        )
    }

    @Test
    fun `rejects a truncated file as malformed`() {
        assertEquals(Rejection.MALFORMED, reasonOf(packageBytes.copyOf(packageBytes.size - 10), context()))
    }

    @Test
    fun `rejects one altered byte in manifest, payload or signature`() {
        val container = GmpContainer.decode(packageBytes)
        val insideManifest = 8 + container.manifest.size / 2
        val insidePayload = 8 + container.manifest.size + 4 + container.payload.size / 2
        val lastSignatureByte = packageBytes.size - 1
        listOf(insideManifest, insidePayload, lastSignatureByte).forEach { index ->
            assertEquals(Rejection.BAD_SIGNATURE, reasonOf(flipped(index), context()), "byte $index")
        }
    }

    @Test
    fun `rejects a package signed by another server`() {
        assertEquals(Rejection.BAD_SIGNATURE, reasonOf(packageBytes, context(serverKey = TestKeys.ecOther.public)))
    }

    @Test
    fun `counts validUntil itself as expired`() {
        assertEquals(Rejection.EXPIRED, reasonOf(packageBytes, context(now = header.validUntil)))
    }

    @Test
    fun `rejects the same version imported twice`() {
        assertEquals(Rejection.NOT_NEWER, reasonOf(packageBytes, context(installed = 2)))
    }

    @Test
    fun `accepts a newer version`() {
        assertIs<VerifyResult.Accepted>(PackageVerifier.verify(packageBytes, context(installed = 1)))
    }

    @Test
    fun `rejects a device that is not a recipient`() {
        assertEquals(Rejection.NOT_A_RECIPIENT, reasonOf(packageBytes, context(cert = "cert-z")))
    }

    @Test
    fun `reports a missing basemap`() {
        assertEquals(Rejection.BASEMAP_MISSING, reasonOf(packageBytes, context(hasBasemap = false)))
    }

    @Test
    fun `reports corruption when the key cannot be unwrapped`() {
        assertEquals(Rejection.CORRUPTED, reasonOf(packageBytes, context(privateKey = TestKeys.rsaOther.private)))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && ./gradlew test --tests geomap.pkg.PackageVerifierTest`
Expected: FAIL, compilation error `Unresolved reference 'VerifyContext'`.

- [ ] **Step 3: Write the implementation**

`shared/src/main/kotlin/geomap/pkg/PackageVerifier.kt`:

```kotlin
package geomap.pkg

import java.security.GeneralSecurityException
import java.security.PublicKey
import java.time.Instant
import java.time.format.DateTimeParseException

enum class Rejection {
    MALFORMED,
    BAD_SIGNATURE,
    EXPIRED,
    NOT_NEWER,
    NOT_A_RECIPIENT,
    BASEMAP_MISSING,
    CORRUPTED,
}

sealed interface VerifyResult {
    data class Accepted(
        val manifest: Manifest,
        val payload: MissionPayload,
    ) : VerifyResult

    data class Rejected(
        val reason: Rejection,
    ) : VerifyResult
}

class VerifyContext(
    val deviceCertSha256: String,
    val unwrapper: KeyUnwrapper,
    val serverSigningKey: PublicKey,
    val now: Instant,
    val installedVersion: (missionId: String) -> Int?,
    val hasBasemap: (BasemapRef) -> Boolean,
)

object PackageVerifier {
    fun verify(
        bytes: ByteArray,
        context: VerifyContext,
    ): VerifyResult {
        val container =
            try {
                GmpContainer.decode(bytes)
            } catch (e: IllegalArgumentException) {
                return VerifyResult.Rejected(Rejection.MALFORMED)
            }
        if (!Ecdsa.verify(container.signedPart, container.signature, context.serverSigningKey)) {
            return VerifyResult.Rejected(Rejection.BAD_SIGNATURE)
        }
        val manifest =
            try {
                ManifestJson.decode(container.manifest)
            } catch (e: IllegalArgumentException) {
                return VerifyResult.Rejected(Rejection.MALFORMED)
            }
        if (manifest.format != 1 || manifest.payload.alg != Aes.ALG) {
            return VerifyResult.Rejected(Rejection.MALFORMED)
        }
        val validUntil =
            try {
                Instant.parse(manifest.validUntil)
            } catch (e: DateTimeParseException) {
                return VerifyResult.Rejected(Rejection.MALFORMED)
            }
        if (!context.now.isBefore(validUntil)) return VerifyResult.Rejected(Rejection.EXPIRED)
        val installed = context.installedVersion(manifest.missionId)
        if (installed != null && manifest.version <= installed) return VerifyResult.Rejected(Rejection.NOT_NEWER)
        val recipient =
            manifest.recipients.find { it.deviceCertSha256 == context.deviceCertSha256 && it.alg == RsaOaep.ALG }
                ?: return VerifyResult.Rejected(Rejection.NOT_A_RECIPIENT)
        if (!context.hasBasemap(manifest.basemap)) return VerifyResult.Rejected(Rejection.BASEMAP_MISSING)
        return try {
            val key = context.unwrapper.unwrap(unb64(recipient.wrappedKey))
            val aad = PackageBuilder.aad(manifest.missionId, manifest.version)
            val plaintext = Aes.decrypt(key, unb64(manifest.payload.iv), container.payload, aad)
            VerifyResult.Accepted(manifest, PayloadCodec.decode(plaintext))
        } catch (e: GeneralSecurityException) {
            VerifyResult.Rejected(Rejection.CORRUPTED)
        } catch (e: IllegalArgumentException) {
            VerifyResult.Rejected(Rejection.CORRUPTED)
        }
    }
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd shared && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): add package verifier with typed rejections"
```

---

### Task 7: Basemap signature

**Files:**
- Create: `shared/src/main/kotlin/geomap/pkg/BasemapSignature.kt`
- Test: `shared/src/test/kotlin/geomap/pkg/BasemapSignatureTest.kt`

**Interfaces:**
- Consumes: `Sha256.bytesOf`, `Ecdsa` (Task 3).
- Produces: `BasemapSignature.sign(file: Path, key: PrivateKey): ByteArray`, `BasemapSignature.verify(file: Path, signature: ByteArray, key: PublicKey): Boolean`. The signature covers the SHA-256 digest of the file, computed by streaming (basemaps can weigh hundreds of MB).

- [ ] **Step 1: Write the failing test**

`shared/src/test/kotlin/geomap/pkg/BasemapSignatureTest.kt`:

```kotlin
package geomap.pkg

import java.nio.file.Files
import java.nio.file.StandardOpenOption
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BasemapSignatureTest {
    private fun basemapFile() =
        Files.createTempFile("zone-nord", ".pmtiles").also { Files.write(it, ByteArray(200_000) { i -> i.toByte() }) }

    @Test
    fun `verifies a signed basemap`() {
        val file = basemapFile()
        val signature = BasemapSignature.sign(file, TestKeys.ec.private)
        assertTrue(BasemapSignature.verify(file, signature, TestKeys.ec.public))
    }

    @Test
    fun `rejects a modified basemap`() {
        val file = basemapFile()
        val signature = BasemapSignature.sign(file, TestKeys.ec.private)
        Files.write(file, byteArrayOf(9), StandardOpenOption.APPEND)
        assertFalse(BasemapSignature.verify(file, signature, TestKeys.ec.public))
    }

    @Test
    fun `rejects a signature from another server`() {
        val file = basemapFile()
        val signature = BasemapSignature.sign(file, TestKeys.ecOther.private)
        assertFalse(BasemapSignature.verify(file, signature, TestKeys.ec.public))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && ./gradlew test --tests geomap.pkg.BasemapSignatureTest`
Expected: FAIL, compilation error `Unresolved reference 'BasemapSignature'`.

- [ ] **Step 3: Write the implementation**

`shared/src/main/kotlin/geomap/pkg/BasemapSignature.kt`:

```kotlin
package geomap.pkg

import java.nio.file.Path
import java.security.PrivateKey
import java.security.PublicKey

object BasemapSignature {
    fun sign(
        file: Path,
        key: PrivateKey,
    ): ByteArray = Ecdsa.sign(Sha256.bytesOf(file), key)

    fun verify(
        file: Path,
        signature: ByteArray,
        key: PublicKey,
    ): Boolean = Ecdsa.verify(Sha256.bytesOf(file), signature, key)
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd shared && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): add streaming basemap signature"
```
