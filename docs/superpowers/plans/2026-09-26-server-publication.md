# Server Publication Implementation Plan (plan 2c-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish missions: turn the validated objects of a mission into an encrypted, signed `.gmp` package for its enrolled devices, keep versions with a snapshot, rebuild the current package when the device list changes, export it for SD cards, and withdraw missions.

**Architecture:** `PayloadBuilder` renders the published objects into `shared`'s `MissionPayload` (GeoJSON per zoom band, PNG icons, summary). `PublicationService` validates, locks the mission then its devices in sorted id order, builds the package with `shared`'s `PackageBuilder` and the server signing key, stores it in MinIO and records a `mission_version` row holding the snapshot needed to rebuild it. Assignment changes rebuild the latest version under the same number (spec §5.6). Export streams the latest package; withdrawal freezes the mission.

**Tech Stack:** Kotlin 2.2.20, Spring Boot 4.1.0, `geomap:geomap-shared` (`PackageBuilder`, `PackageVerifier`, `MissionPayload`, `ZoomBand`, `MissionHeader`, `RecipientKey`, `BasemapRef`, `Sha256`), Jackson 3, PostgreSQL, MinIO, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` (sections 5, 6.2, 6.3, 9)

**Plan series:** 2a, 2b, 2c-1 done (branch `feature/server`) → **2c-2 (this plan)** → 2d (enrollment, mTLS device sync, PKI adapter, deletion orders).

## Global Constraints

- Everything from plans 2a, 2b and 2c-1 still applies. **No AI attribution in commit messages — no `Co-Authored-By` or "Generated with" line of any kind.**
- Published objects = `HUMAN` or `ACCEPTED`; pending and rejected suggestions never reach a package.
- Only humans publish, withdraw and export (agents 403).
- Lock order everywhere: mission row first (`MissionService.editable`), then device rows via `DeviceRepository.findForUpdate` in ascending UUID order.
- Recipients = devices assigned to the mission whose status is `ENROLLED`, as `RecipientKey(device.certSha256, device.publicKey())`. A package always has at least one recipient.
- Package header: `MissionHeader(missionId.toString(), versionNumber, publishedAt, validUntil, BasemapRef(basemap.id, basemap.sha256))`; signed with `ServerSigningKey.privateKey`.
- Payload: `ZoomBand.LOW/MID/HIGH` rendered with `RenderBand` of the same name; icons 64 px, stored as `<sha256 of PNG>.png`; summary `"# <mission name>\n"` (no summary field exists yet in V1).
- Packages stored in MinIO under `packages/<missionId>/<number>-<random UUID>.gmp`; one `mission_version` row per version number, updated in place on rebuild.
- A mission that has ever been published cannot be deleted (409: withdraw it instead).

## Review Focus

- A package built by the server must open with `shared`'s `PackageVerifier` for each enrolled recipient and contain exactly the published objects. (Tasks 1, 2.)
- A pending AI suggestion must never appear in any zoom band of a package. (Task 2.)
- Publishing an unpublishable mission (validator errors, no enrolled recipient, withdrawn) must refuse and store nothing. (Task 2.)
- A rebuild after an assignment change must keep the version number and the published snapshot, not the current draft. (Task 3.)
- A withdrawn mission can no longer be exported; a published mission can no longer be deleted. (Task 4.)

## File Structure

| File | Responsibility |
|---|---|
| `server/src/main/kotlin/geomap/server/publication/PayloadBuilder.kt` | objects → `MissionPayload` |
| `server/src/main/kotlin/geomap/server/publication/MissionVersion.kt` | version model + repository |
| `server/src/main/kotlin/geomap/server/publication/PublicationService.kt` | publish, rebuild, export |
| `server/src/main/kotlin/geomap/server/publication/PublicationController.kt` | publish, versions, package routes |
| `server/src/main/resources/db/migration/V4__mission_version.sql` | schema |
| `server/src/main/kotlin/geomap/server/mission/{MissionRepository,MissionService,MissionController,MissionValidator}.kt` | `markPublished`, withdraw, delete guard, `NO_RECIPIENT` |
| `server/src/main/kotlin/geomap/server/device/DeviceService.kt` | rebuild on assignment change |
| `server/src/test/kotlin/geomap/server/TestDevices.kt` | test device fixture with a known RSA key |

---

### Task 1: Payload builder

**Files:**
- Create: `server/src/main/kotlin/geomap/server/publication/PayloadBuilder.kt`
- Test: `server/src/test/kotlin/geomap/server/publication/PayloadBuilderTest.kt`

**Interfaces:**
- Consumes: `SymbolCatalog.validate`, `SymbolRenderer.icon/graphic`, `RenderBand`, `SymbolGeometry` (2b); `GeoJsonGeometry.controlPoints`, `Feature`, `FeatureKind` (2a); `geomap.pkg.MissionPayload`, `ZoomBand`, `Sha256`.
- Produces: `@Component class PayloadBuilder(catalog: SymbolCatalog, renderer: SymbolRenderer, json: ObjectMapper)` with `build(missionName: String, features: List<Feature>): MissionPayload`. Every output feature carries `properties.featureId` (the object's UUID as a string). Generic objects: original geometry, properties `kind = "generic"`, `name`, `description`, `style`. Point symbols: original geometry, properties `kind = "symbol"`, `name`, `description`, `icon` (`<sha256>.png`), `anchorX`, `anchorY`. Line/area symbols: the renderer's features for that band, each with `featureId` added. Callers pass only objects that must be published.

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/publication/PayloadBuilderTest.kt`:

```kotlin
package geomap.server.publication

import geomap.pkg.ZoomBand
import geomap.server.mission.BBox
import geomap.server.mission.Feature
import geomap.server.mission.FeatureKind
import geomap.server.mission.FeatureOrigin
import geomap.server.symbology.SymbolCatalog
import geomap.server.symbology.SymbolRenderer
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class PayloadBuilderTest {
    private val json = JsonMapper.builder().build()
    private val builder = PayloadBuilder(SymbolCatalog(), SymbolRenderer(json), json)

    private fun feature(
        kind: FeatureKind,
        geometry: Map<String, Any?>,
        sidc: String? = null,
        name: String = "",
    ) = Feature(
        id = UUID.randomUUID(),
        missionId = UUID.randomUUID(),
        kind = kind,
        geometry = geometry,
        bbox = BBox(0.0, 0.0, 0.0, 0.0),
        name = name,
        description = "",
        style = if (kind == FeatureKind.GENERIC) mapOf("color" to "#ff0000") else null,
        sidc = sidc,
        modifiers = null,
        origin = FeatureOrigin.HUMAN,
        suggestionStatus = null,
        createdAt = Instant.now(),
        updatedAt = Instant.now(),
    )

    private val zone =
        feature(
            FeatureKind.GENERIC,
            mapOf("type" to "Polygon", "coordinates" to listOf(listOf(listOf(2.0, 48.0), listOf(3.0, 48.0), listOf(3.0, 49.0), listOf(2.0, 48.0)))),
            name = "Zone rouge",
        )
    private val infantry = feature(FeatureKind.APP6, mapOf("type" to "Point", "coordinates" to listOf(2.35, 48.85)), "10031000001211000000")
    private val flot =
        feature(
            FeatureKind.APP6,
            mapOf("type" to "LineString", "coordinates" to listOf(listOf(2.0, 48.0), listOf(2.5, 48.2), listOf(3.0, 48.1))),
            "10032500001401000000",
        )

    @Suppress("UNCHECKED_CAST")
    private fun features(text: String) = json.readValue(text, Map::class.java)["features"] as List<Map<String, Any?>>

    @Suppress("UNCHECKED_CAST")
    private fun Map<String, Any?>.properties() = this["properties"] as Map<String, Any?>

    @Test
    fun `renders every zoom band with the objects tagged by id`() {
        val payload = builder.build("Op Nord", listOf(zone, infantry, flot))
        assertEquals(ZoomBand.entries.toSet(), payload.features.keys)
        ZoomBand.entries.forEach { band ->
            val ids = features(payload.features.getValue(band)).map { it.properties()["featureId"] }.toSet()
            assertEquals(setOf("${zone.id}", "${infantry.id}", "${flot.id}"), ids)
        }
    }

    @Test
    fun `keeps generic objects as drawn`() {
        val rendered = features(builder.build("Op Nord", listOf(zone)).features.getValue(ZoomBand.MID)).single()
        assertEquals(zone.geometry, rendered["geometry"])
        assertEquals("generic", rendered.properties()["kind"])
        assertEquals("Zone rouge", rendered.properties()["name"])
    }

    @Test
    fun `ships point symbols as icons`() {
        val payload = builder.build("Op Nord", listOf(infantry))
        val rendered = features(payload.features.getValue(ZoomBand.LOW)).single().properties()
        val icon = rendered["icon"] as String
        assertTrue(icon in payload.icons.keys)
        assertEquals(0x89.toByte(), payload.icons.getValue(icon)[0])
        assertTrue(rendered["anchorX"] is Number && rendered["anchorY"] is Number)
    }

    @Test
    fun `renders tactical graphics per zoom band`() {
        val payload = builder.build("Op Nord", listOf(flot))
        assertTrue(features(payload.features.getValue(ZoomBand.MID)).any { (it["geometry"] as Map<*, *>)["type"] == "MultiLineString" })
        assertNotEquals(payload.features.getValue(ZoomBand.LOW), payload.features.getValue(ZoomBand.HIGH))
    }

    @Test
    fun `writes a summary with the mission name`() {
        assertEquals("# Op Nord\n", builder.build("Op Nord", emptyList()).summary)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.publication.PayloadBuilderTest`
Expected: FAIL, compilation error `Unresolved reference 'PayloadBuilder'`.

- [ ] **Step 3: Write the implementation**

`server/src/main/kotlin/geomap/server/publication/PayloadBuilder.kt`:

```kotlin
package geomap.server.publication

import geomap.pkg.MissionPayload
import geomap.pkg.Sha256
import geomap.pkg.ZoomBand
import geomap.server.mission.Feature
import geomap.server.mission.FeatureKind
import geomap.server.mission.GeoJsonGeometry
import geomap.server.symbology.RenderBand
import geomap.server.symbology.SymbolCatalog
import geomap.server.symbology.SymbolGeometry
import geomap.server.symbology.SymbolRenderer
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

@Component
class PayloadBuilder(
    private val catalog: SymbolCatalog,
    private val renderer: SymbolRenderer,
    private val json: ObjectMapper,
) {
    fun build(
        missionName: String,
        features: List<Feature>,
    ): MissionPayload {
        val icons = mutableMapOf<String, ByteArray>()
        val bands =
            ZoomBand.entries.associateWith { band ->
                val rendered = features.flatMap { render(it, RenderBand.valueOf(band.name), icons) }
                json.writeValueAsString(mapOf("type" to "FeatureCollection", "features" to rendered))
            }
        return MissionPayload(bands, icons, "# $missionName\n")
    }

    @Suppress("UNCHECKED_CAST")
    private fun render(
        feature: Feature,
        band: RenderBand,
        icons: MutableMap<String, ByteArray>,
    ): List<Map<String, Any?>> {
        val common = mapOf("featureId" to "${feature.id}", "name" to feature.name, "description" to feature.description)
        if (feature.kind == FeatureKind.GENERIC) {
            return listOf(geoJson(feature.geometry, common + mapOf("kind" to "generic", "style" to feature.style)))
        }
        val sidc = feature.sidc!!
        val modifiers = feature.modifiers.orEmpty()
        val symbol = catalog.validate(sidc, feature.geometry, feature.modifiers)
        if (symbol.geometry == SymbolGeometry.POINT) {
            val icon = renderer.icon(sidc, modifiers, ICON_SIZE)
            // Content-addressed name: identical symbols share one PNG in the package.
            val name = Sha256.hex(icon.png) + ".png"
            icons[name] = icon.png
            return listOf(geoJson(feature.geometry, common + mapOf("kind" to "symbol", "icon" to name, "anchorX" to icon.anchorX, "anchorY" to icon.anchorY)))
        }
        val graphic = renderer.graphic(sidc, GeoJsonGeometry.controlPoints(feature.geometry), modifiers, band)
        return (graphic["features"] as List<Map<String, Any?>>).map { rendered ->
            rendered + ("properties" to ((rendered["properties"] as Map<String, Any?>) + ("featureId" to "${feature.id}")))
        }
    }

    private fun geoJson(
        geometry: Map<String, Any?>,
        properties: Map<String, Any?>,
    ) = mapOf("type" to "Feature", "geometry" to geometry, "properties" to properties)

    private companion object {
        const val ICON_SIZE = 64
    }
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `PayloadBuilderTest` (5) and all earlier tests pass.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): build mission package payloads from published objects"
```

---

### Task 2: Versioned publication

**Files:**
- Create: `server/src/main/resources/db/migration/V4__mission_version.sql`, `server/src/main/kotlin/geomap/server/publication/MissionVersion.kt`, `server/src/main/kotlin/geomap/server/publication/PublicationService.kt`, `server/src/main/kotlin/geomap/server/publication/PublicationController.kt`, `server/src/test/kotlin/geomap/server/TestDevices.kt`
- Modify: `server/src/main/kotlin/geomap/server/mission/MissionRepository.kt` (`markPublished`), `server/src/main/kotlin/geomap/server/mission/MissionValidator.kt` (`NO_RECIPIENT`), `server/src/test/kotlin/geomap/server/IntegrationTest.kt` (truncate `mission_version`), `server/src/test/kotlin/geomap/server/mission/MissionValidationTest.kt`
- Test: `server/src/test/kotlin/geomap/server/publication/PublicationApiTest.kt`

**Interfaces:**
- Consumes: `PayloadBuilder` (Task 1); `MissionService.get/editable` (2a); `MissionValidator.validate` (2b); `BasemapRepository.find` (2c-1); `DeviceRepository.findForUpdate`, `AssignmentRepository.devices/replace`, `Device.publicKey()`, `DeviceStatus` (2c-1); `ObjectStore.put/get`, `ServerSigningKey` (2c-1); `geomap.pkg.PackageBuilder`, `MissionHeader`, `RecipientKey`, `BasemapRef`, `Sha256`.
- Produces:
  - `data class MissionVersion(id: UUID, missionId: UUID, number: Int, missionName: String, basemapId: String, basemapSha256: String, validUntil: Instant, snapshot: String /* JSON list of Feature */, objectKey: String, sha256: String, sizeBytes: Long, recipients: Int, publishedBy: String, publishedAt: Instant)` with `view(): PublicationView`; `data class PublicationView(missionId, version, sha256, sizeBytes, recipients, publishedBy, publishedAt)`
  - `MissionVersionRepository.insert`, `.updatePackage(version)` (object key, sha256, size, recipients), `.latest(missionId): MissionVersion?`, `.all(missionId)` (newest first), `.exists(missionId): Boolean`
  - `MissionRepository.markPublished(id, updatedBy, updatedAt)`
  - `PublicationService.publish(actor, missionId): PublicationView`, `.versions(missionId)`, `.rebuild(actor, latest: MissionVersion): MissionVersion` (used by Task 3), `.snapshotOf(version): List<Feature>`
  - Validator error `NO_RECIPIENT` ("no enrolled device is assigned"), checked after the expiry rules
  - HTTP (`planificateur`): `POST /api/missions/{missionId}/publish` → 201 `PublicationView`; `GET /api/missions/{missionId}/versions`
  - Test fixture `object TestDevices { val keys: KeyPair; fun insert(repo: DeviceRepository, cert: Char, status: DeviceStatus = ENROLLED): Device }`

Refusals: agent → 403; unknown mission → 404; withdrawn → 409; validator errors → 409 `"mission is not publishable: <CODE>, <CODE>"`; `PackageBuilder` limits (`IllegalArgumentException`) → 409 `"mission cannot be packaged: <reason>"`. Nothing is recorded on refusal (the transaction rolls back; a MinIO object written before a later failure is an accepted orphan). Audit `mission.publish`, target `mission:<id>`, details `{"version": n, "recipients": k}`.

- [ ] **Step 1: Migration, fixture and test base**

`server/src/main/resources/db/migration/V4__mission_version.sql`:

```sql
CREATE TABLE mission_version (
    id             UUID PRIMARY KEY,
    mission_id     UUID        NOT NULL REFERENCES mission (id) ON DELETE CASCADE,
    number         INT         NOT NULL CHECK (number > 0),
    mission_name   TEXT        NOT NULL,
    basemap_id     TEXT        NOT NULL REFERENCES basemap (id),
    basemap_sha256 TEXT        NOT NULL,
    valid_until    TIMESTAMPTZ NOT NULL,
    snapshot       JSONB       NOT NULL,
    object_key     TEXT        NOT NULL,
    sha256         TEXT        NOT NULL,
    size_bytes     BIGINT      NOT NULL,
    recipients     INT         NOT NULL CHECK (recipients > 0),
    published_by   TEXT        NOT NULL,
    published_at   TIMESTAMPTZ NOT NULL,
    UNIQUE (mission_id, number)
);
```

In `IntegrationTest.setUpMvc`, change the truncation to:

```kotlin
        jdbc.sql("TRUNCATE audit_event, mission_version, assignment, feature, mission, basemap, device").update()
```

`server/src/test/kotlin/geomap/server/TestDevices.kt`:

```kotlin
package geomap.server

import geomap.server.device.Device
import geomap.server.device.DeviceRepository
import geomap.server.device.DeviceStatus
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.time.Instant
import java.util.Base64
import java.util.UUID

// One RSA-3072 pair shared by all test devices (generation takes ~1 s); devices differ by certificate fingerprint.
object TestDevices {
    val keys: KeyPair by lazy { KeyPairGenerator.getInstance("RSA").apply { initialize(3072) }.generateKeyPair() }

    fun insert(
        repo: DeviceRepository,
        cert: Char,
        status: DeviceStatus = DeviceStatus.ENROLLED,
    ): Device {
        val device =
            Device(UUID.randomUUID(), "Tablette $cert", "$cert".repeat(64), Base64.getEncoder().encodeToString(keys.public.encoded), status, null, Instant.now())
        repo.insert(device)
        return device
    }
}
```

In `MissionValidationTest`: add `@Autowired private lateinit var devices: DeviceRepository` and `@Autowired private lateinit var assignments: AssignmentRepository` (imports `geomap.server.TestDevices`, `geomap.server.device.AssignmentRepository`, `geomap.server.device.DeviceRepository`); at the end of `createCompleteMission()` add:

```kotlin
        assignments.replace(UUID.fromString(missionId), setOf(TestDevices.insert(devices, 'a').id))
```

and in `a mission without basemap nor expiry is not publishable`, expect `containsInAnyOrder("NO_BASEMAP", "NO_EXPIRY", "NO_RECIPIENT")`. Add:

```kotlin
    @Test
    fun `a mission without an enrolled device is not publishable`() {
        jdbc.sql("UPDATE device SET status = 'REVOKED'").update()
        add(infantry)
        validation().andExpect {
            jsonPath("$.publishable") { value(false) }
            jsonPath("$.errors[0].code") { value("NO_RECIPIENT") }
        }
    }
```

- [ ] **Step 2: Write the failing publication test**

`server/src/test/kotlin/geomap/server/publication/PublicationApiTest.kt`:

```kotlin
package geomap.server.publication

import com.jayway.jsonpath.JsonPath
import geomap.pkg.Manifest
import geomap.pkg.MissionPayload
import geomap.pkg.PackageVerifier
import geomap.pkg.SoftwareKeyUnwrapper
import geomap.pkg.VerifyContext
import geomap.pkg.VerifyResult
import geomap.pkg.ZoomBand
import geomap.server.IntegrationTest
import geomap.server.TestDevices
import geomap.server.basemap.Basemap
import geomap.server.basemap.BasemapRepository
import geomap.server.device.AssignmentRepository
import geomap.server.device.Device
import geomap.server.device.DeviceRepository
import geomap.server.security.ServerSigningKey
import geomap.server.storage.ObjectStore
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PublicationApiTest : IntegrationTest() {
    @Autowired private lateinit var basemaps: BasemapRepository

    @Autowired private lateinit var devices: DeviceRepository

    @Autowired private lateinit var assignments: AssignmentRepository

    @Autowired private lateinit var versions: MissionVersionRepository

    @Autowired private lateinit var store: ObjectStore

    @Autowired private lateinit var signingKey: ServerSigningKey

    private lateinit var missionId: String
    private lateinit var deviceA: Device

    private val infantry = """{"kind":"APP6","geometry":{"type":"Point","coordinates":[2.35,48.85]},"sidc":"10031000001211000000"}"""
    private val flot =
        """{"kind":"APP6","geometry":{"type":"LineString","coordinates":[[2.0,48.0],[3.0,48.1]]},"sidc":"10032500001401000000"}"""

    @BeforeEach
    fun completeMission() {
        basemaps.insert(Basemap("zone-nord", "Zone Nord", 1, "basemaps/zone-nord/x.pmtiles", "b".repeat(64), "c2ln", "root", Instant.now()))
        val body =
            mvc
                .post("/api/missions") {
                    with(planner())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"name":"Op Nord","basemapId":"zone-nord","validUntil":"2099-01-01T00:00:00Z"}"""
                }.andReturn()
                .response.contentAsString
        missionId = JsonPath.read(body, "$.id")
        deviceA = TestDevices.insert(devices, 'a')
        assignments.replace(UUID.fromString(missionId), setOf(deviceA.id))
        add(infantry)
        add(flot)
    }

    private fun add(
        body: String,
        who: RequestPostProcessor = planner(),
    ) {
        mvc
            .post("/api/missions/$missionId/features") {
                with(who)
                contentType = MediaType.APPLICATION_JSON
                content = body
            }.andExpect { status { isCreated() } }
    }

    private fun publish(who: RequestPostProcessor = planner()) = mvc.post("/api/missions/$missionId/publish") { with(who) }

    private fun latestPackage(): ByteArray = store.get(versions.latest(UUID.fromString(missionId))!!.objectKey).use { it.readBytes() }

    private fun open(
        bytes: ByteArray,
        device: Device = deviceA,
    ): Pair<Manifest, MissionPayload> {
        val context =
            VerifyContext(device.certSha256, SoftwareKeyUnwrapper(TestDevices.keys.private), signingKey.publicKey, Instant.now(), { null }, { true })
        val accepted = assertIs<VerifyResult.Accepted>(PackageVerifier.verify(bytes, context))
        return accepted.manifest to accepted.payload
    }

    @Test
    fun `publishes a package the assigned device can open`() {
        publish().andExpect {
            status { isCreated() }
            jsonPath("$.version") { value(1) }
            jsonPath("$.recipients") { value(1) }
        }
        val (manifest, payload) = open(latestPackage())
        assertEquals(missionId, manifest.missionId)
        assertEquals(1, manifest.version)
        assertEquals("b".repeat(64), manifest.basemap.sha256)
        assertEquals("2099-01-01T00:00:00Z", manifest.validUntil)
        assertEquals("# Op Nord\n", payload.summary)
        assertEquals(1, payload.icons.size)
        assertTrue(payload.features.getValue(ZoomBand.MID).contains("MultiLineString"))
        mvc.get("/api/missions/$missionId") { with(planner()) }.andExpect { jsonPath("$.status") { value("PUBLISHED") } }
    }

    @Test
    fun `each publication is a new version`() {
        publish()
        publish().andExpect { jsonPath("$.version") { value(2) } }
        assertEquals(2, open(latestPackage()).first.version)
        mvc.get("/api/missions/$missionId/versions") { with(planner()) }.andExpect {
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].version") { value(2) }
        }
    }

    @Test
    fun `pending suggestions are never published`() {
        add("""{"kind":"GENERIC","geometry":{"type":"Point","coordinates":[2.0,48.0]},"name":"Suggestion IA"}""", agent())
        publish()
        val payload = open(latestPackage()).second
        ZoomBand.entries.forEach { assertFalse(payload.features.getValue(it).contains("Suggestion IA")) }
    }

    @Test
    fun `an unpublishable mission is refused and nothing is stored`() {
        jdbc.sql("UPDATE mission SET basemap_id = NULL WHERE id = CAST(:id AS uuid)").param("id", missionId).update()
        publish().andExpect {
            status { isConflict() }
            jsonPath("$.detail") { value("mission is not publishable: NO_BASEMAP") }
        }
        assertNull(versions.latest(UUID.fromString(missionId)))
    }

    @Test
    fun `a mission whose devices are all revoked is refused`() {
        jdbc.sql("UPDATE device SET status = 'REVOKED'").update()
        publish().andExpect { status { isConflict() } }
        assertNull(versions.latest(UUID.fromString(missionId)))
    }

    @Test
    fun `only a human publishes`() {
        publish(agent()).andExpect { status { isForbidden() } }
        assertNull(versions.latest(UUID.fromString(missionId)))
    }

    @Test
    fun `a withdrawn or unknown mission cannot be published`() {
        jdbc.sql("UPDATE mission SET status = 'WITHDRAWN' WHERE id = CAST(:id AS uuid)").param("id", missionId).update()
        publish().andExpect { status { isConflict() } }
        mvc.post("/api/missions/00000000-0000-0000-0000-000000000000/publish") { with(planner()) }.andExpect { status { isNotFound() } }
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd server && ./gradlew test --tests geomap.server.publication.PublicationApiTest --tests geomap.server.mission.MissionValidationTest`
Expected: FAIL, compilation error `Unresolved reference 'MissionVersionRepository'`.

- [ ] **Step 4: Write the implementation**

In `MissionRepository`, add:

```kotlin
    fun markPublished(
        id: UUID,
        updatedBy: String,
        updatedAt: Instant,
    ) {
        jdbc
            .sql("UPDATE mission SET status = 'PUBLISHED', updated_by = :updatedBy, updated_at = :updatedAt WHERE id = :id")
            .param("id", id)
            .param("updatedBy", updatedBy)
            .param("updatedAt", updatedAt.toUtc())
            .update()
    }
```

In `MissionValidator`: add the constructor parameter `private val assignments: AssignmentRepository` (imports `geomap.server.device.AssignmentRepository`, `geomap.server.device.DeviceStatus`) and, right after the expiry `when`, add:

```kotlin
        if (assignments.devices(missionId).none { it.status == DeviceStatus.ENROLLED }) {
            errors += ValidationIssue("NO_RECIPIENT", "no enrolled device is assigned")
        }
```

`server/src/main/kotlin/geomap/server/publication/MissionVersion.kt`:

```kotlin
package geomap.server.publication

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

data class MissionVersion(
    val id: UUID,
    val missionId: UUID,
    val number: Int,
    val missionName: String,
    val basemapId: String,
    val basemapSha256: String,
    val validUntil: Instant,
    val snapshot: String,
    val objectKey: String,
    val sha256: String,
    val sizeBytes: Long,
    val recipients: Int,
    val publishedBy: String,
    val publishedAt: Instant,
) {
    fun view() = PublicationView(missionId, number, sha256, sizeBytes, recipients, publishedBy, publishedAt)
}

data class PublicationView(
    val missionId: UUID,
    val version: Int,
    val sha256: String,
    val sizeBytes: Long,
    val recipients: Int,
    val publishedBy: String,
    val publishedAt: Instant,
)

@Repository
class MissionVersionRepository(
    private val jdbc: JdbcClient,
) {
    fun insert(version: MissionVersion) {
        jdbc
            .sql(
                """
                INSERT INTO mission_version (id, mission_id, number, mission_name, basemap_id, basemap_sha256, valid_until, snapshot,
                                             object_key, sha256, size_bytes, recipients, published_by, published_at)
                VALUES (:id, :missionId, :number, :missionName, :basemapId, :basemapSha256, :validUntil, CAST(:snapshot AS jsonb),
                        :objectKey, :sha256, :sizeBytes, :recipients, :publishedBy, :publishedAt)
                """.trimIndent(),
            ).param("id", version.id)
            .param("missionId", version.missionId)
            .param("number", version.number)
            .param("missionName", version.missionName)
            .param("basemapId", version.basemapId)
            .param("basemapSha256", version.basemapSha256)
            .param("validUntil", version.validUntil.toUtc())
            .param("snapshot", version.snapshot)
            .param("objectKey", version.objectKey)
            .param("sha256", version.sha256)
            .param("sizeBytes", version.sizeBytes)
            .param("recipients", version.recipients)
            .param("publishedBy", version.publishedBy)
            .param("publishedAt", version.publishedAt.toUtc())
            .update()
    }

    fun updatePackage(version: MissionVersion) {
        jdbc
            .sql("UPDATE mission_version SET object_key = :objectKey, sha256 = :sha256, size_bytes = :sizeBytes, recipients = :recipients WHERE id = :id")
            .param("id", version.id)
            .param("objectKey", version.objectKey)
            .param("sha256", version.sha256)
            .param("sizeBytes", version.sizeBytes)
            .param("recipients", version.recipients)
            .update()
    }

    fun latest(missionId: UUID): MissionVersion? = all(missionId).firstOrNull()

    // ponytail: loads every version with its snapshot; add a projection without `snapshot` if missions accumulate many large versions.
    fun all(missionId: UUID): List<MissionVersion> =
        jdbc
            .sql("SELECT * FROM mission_version WHERE mission_id = :missionId ORDER BY number DESC")
            .param("missionId", missionId)
            .query { rs, _ -> map(rs) }
            .list()

    fun exists(missionId: UUID): Boolean =
        jdbc
            .sql("SELECT EXISTS (SELECT 1 FROM mission_version WHERE mission_id = :missionId)")
            .param("missionId", missionId)
            .query(Boolean::class.java)
            .single()

    private fun map(rs: ResultSet) =
        MissionVersion(
            id = rs.getObject("id", UUID::class.java),
            missionId = rs.getObject("mission_id", UUID::class.java),
            number = rs.getInt("number"),
            missionName = rs.getString("mission_name"),
            basemapId = rs.getString("basemap_id"),
            basemapSha256 = rs.getString("basemap_sha256"),
            validUntil = rs.instant("valid_until")!!,
            snapshot = rs.getString("snapshot"),
            objectKey = rs.getString("object_key"),
            sha256 = rs.getString("sha256"),
            sizeBytes = rs.getLong("size_bytes"),
            recipients = rs.getInt("recipients"),
            publishedBy = rs.getString("published_by"),
            publishedAt = rs.instant("published_at")!!,
        )
}
```

`server/src/main/kotlin/geomap/server/publication/PublicationService.kt`:

```kotlin
package geomap.server.publication

import geomap.pkg.BasemapRef
import geomap.pkg.MissionHeader
import geomap.pkg.PackageBuilder
import geomap.pkg.RecipientKey
import geomap.pkg.Sha256
import geomap.server.audit.AuditEvent
import geomap.server.audit.AuditRepository
import geomap.server.basemap.BasemapRepository
import geomap.server.device.AssignmentRepository
import geomap.server.device.Device
import geomap.server.device.DeviceRepository
import geomap.server.device.DeviceStatus
import geomap.server.mission.Feature
import geomap.server.mission.FeatureOrigin
import geomap.server.mission.FeatureRepository
import geomap.server.mission.MissionRepository
import geomap.server.mission.MissionService
import geomap.server.mission.MissionValidator
import geomap.server.mission.SuggestionStatus
import geomap.server.security.Actor
import geomap.server.security.ServerSigningKey
import geomap.server.storage.ObjectStore
import geomap.server.web.ConflictException
import geomap.server.web.ForbiddenException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.util.UUID

@Service
class PublicationService(
    private val missions: MissionService,
    private val missionRows: MissionRepository,
    private val features: FeatureRepository,
    private val validator: MissionValidator,
    private val basemaps: BasemapRepository,
    private val devices: DeviceRepository,
    private val assignments: AssignmentRepository,
    private val versions: MissionVersionRepository,
    private val payloads: PayloadBuilder,
    private val store: ObjectStore,
    private val signingKey: ServerSigningKey,
    private val audit: AuditRepository,
    private val json: ObjectMapper,
    private val clock: Clock,
) {
    fun versions(missionId: UUID): List<PublicationView> {
        missions.get(missionId)
        return versions.all(missionId).map { it.view() }
    }

    @Transactional
    fun publish(
        actor: Actor,
        missionId: UUID,
    ): PublicationView {
        if (actor.isAgent) throw ForbiddenException("only a human can publish a mission")
        val mission = missions.editable(missionId)
        val report = validator.validate(missionId)
        if (!report.publishable) throw ConflictException("mission is not publishable: ${report.errors.joinToString { it.code }}")
        val recipients = lockedRecipients(missionId)
        val published = features.findByMission(missionId).filter { it.origin == FeatureOrigin.HUMAN || it.suggestionStatus == SuggestionStatus.ACCEPTED }
        val basemap = basemaps.find(mission.basemapId!!)!!
        val now = clock.instant()
        val draft =
            MissionVersion(
                id = UUID.randomUUID(),
                missionId = missionId,
                number = (versions.latest(missionId)?.number ?: 0) + 1,
                missionName = mission.name,
                basemapId = basemap.id,
                basemapSha256 = basemap.sha256,
                validUntil = mission.validUntil!!,
                snapshot = json.writeValueAsString(published),
                objectKey = "",
                sha256 = "",
                sizeBytes = 0,
                recipients = 0,
                publishedBy = actor.user,
                publishedAt = now,
            )
        val version = storePackage(draft, published, recipients)
        versions.insert(version)
        missionRows.markPublished(missionId, actor.user, now)
        audit.record(
            AuditEvent(now, actor.user, actor.agent, "mission.publish", "mission:$missionId", mapOf("version" to version.number, "recipients" to recipients.size)),
        )
        return version.view()
    }

    // Spec §5.6: a new recipient list rebuilds the latest version under the same number, from its published snapshot.
    // Callers hold the mission lock inside a transaction.
    fun rebuild(
        actor: Actor,
        latest: MissionVersion,
    ): MissionVersion {
        val recipients = lockedRecipients(latest.missionId)
        if (recipients.isEmpty()) throw ConflictException("a published mission needs at least one enrolled device; withdraw it instead")
        val rebuilt = storePackage(latest, snapshotOf(latest), recipients)
        versions.updatePackage(rebuilt)
        audit.record(
            AuditEvent(
                clock.instant(),
                actor.user,
                actor.agent,
                "mission.republish",
                "mission:${latest.missionId}",
                mapOf("version" to latest.number, "recipients" to recipients.size),
            ),
        )
        return rebuilt
    }

    fun snapshotOf(version: MissionVersion): List<Feature> =
        json.readValue(version.snapshot, json.typeFactory.constructCollectionType(List::class.java, Feature::class.java))

    // Mission row first (callers), then devices in ascending id order: the order every writer uses, so no deadlock.
    private fun lockedRecipients(missionId: UUID): List<Device> =
        assignments
            .devices(missionId)
            .map { it.id }
            .sorted()
            .mapNotNull { devices.findForUpdate(it) }
            .filter { it.status == DeviceStatus.ENROLLED }

    private fun storePackage(
        version: MissionVersion,
        published: List<Feature>,
        recipients: List<Device>,
    ): MissionVersion {
        val header =
            MissionHeader(version.missionId.toString(), version.number, version.publishedAt, version.validUntil, BasemapRef(version.basemapId, version.basemapSha256))
        val bytes =
            try {
                PackageBuilder(signingKey.privateKey).build(
                    header,
                    payloads.build(version.missionName, published),
                    recipients.map { RecipientKey(it.certSha256, it.publicKey()) },
                )
            } catch (e: IllegalArgumentException) {
                throw ConflictException("mission cannot be packaged: ${e.message}")
            }
        val key = "packages/${version.missionId}/${version.number}-${UUID.randomUUID()}.gmp"
        store.put(key, bytes.inputStream(), bytes.size.toLong(), "application/octet-stream")
        return version.copy(objectKey = key, sha256 = Sha256.hex(bytes), sizeBytes = bytes.size.toLong(), recipients = recipients.size)
    }
}
```

If `json.typeFactory` is not available on Jackson 3's `ObjectMapper`, use `json.readValue(version.snapshot, object : tools.jackson.core.type.TypeReference<List<Feature>>() {})` and report it. `InvalidInputException` (thrown by rendering) extends `RuntimeException`, not `IllegalArgumentException`, so it is not swallowed by the packaging catch — the validator already guarantees rendering succeeds.

`server/src/main/kotlin/geomap/server/publication/PublicationController.kt`:

```kotlin
package geomap.server.publication

import geomap.server.security.Actor
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/missions/{missionId}")
@PreAuthorize("hasRole('planificateur')")
class PublicationController(
    private val service: PublicationService,
) {
    @PostMapping("/publish")
    @ResponseStatus(HttpStatus.CREATED)
    fun publish(
        @PathVariable missionId: UUID,
        authentication: Authentication,
    ): PublicationView = service.publish(Actor.of(authentication), missionId)

    @GetMapping("/versions")
    fun versions(
        @PathVariable missionId: UUID,
    ): List<PublicationView> = service.versions(missionId)
}
```

- [ ] **Step 5: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `PublicationApiTest` (7), `MissionValidationTest` (8) and all earlier tests pass. This is the first server-side run of `shared` serialization with the server's `kotlinx-serialization-json` version — if it fails at runtime, pin `org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0` in `server/build.gradle.kts` and report it.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): publish missions as encrypted signed packages"
```

---

### Task 3: Rebuild the package when devices change

**Files:**
- Modify: `server/src/main/kotlin/geomap/server/device/DeviceService.kt`
- Test: `server/src/test/kotlin/geomap/server/publication/RepublishTest.kt`

**Interfaces:**
- Consumes: `PublicationService.rebuild`, `MissionVersionRepository.latest` (Task 2); `TestDevices` (Task 2).
- Produces: `DeviceService.assign` rebuilds the latest version (if any) after replacing the assignments, inside the same transaction and locks; an assignment that leaves a published mission without any enrolled device is refused (409, nothing changed). The mission status is unchanged.

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/publication/RepublishTest.kt`:

```kotlin
package geomap.server.publication

import com.jayway.jsonpath.JsonPath
import geomap.pkg.PackageVerifier
import geomap.pkg.Rejection
import geomap.pkg.SoftwareKeyUnwrapper
import geomap.pkg.VerifyContext
import geomap.pkg.VerifyResult
import geomap.pkg.ZoomBand
import geomap.server.IntegrationTest
import geomap.server.TestDevices
import geomap.server.basemap.Basemap
import geomap.server.basemap.BasemapRepository
import geomap.server.device.AssignmentRepository
import geomap.server.device.Device
import geomap.server.device.DeviceRepository
import geomap.server.security.ServerSigningKey
import geomap.server.storage.ObjectStore
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class RepublishTest : IntegrationTest() {
    @Autowired private lateinit var basemaps: BasemapRepository

    @Autowired private lateinit var devices: DeviceRepository

    @Autowired private lateinit var assignments: AssignmentRepository

    @Autowired private lateinit var versions: MissionVersionRepository

    @Autowired private lateinit var store: ObjectStore

    @Autowired private lateinit var signingKey: ServerSigningKey

    private lateinit var missionId: String
    private lateinit var deviceA: Device
    private lateinit var deviceB: Device

    @BeforeEach
    fun publishedMission() {
        basemaps.insert(Basemap("zone-nord", "Zone Nord", 1, "basemaps/zone-nord/x.pmtiles", "b".repeat(64), "c2ln", "root", Instant.now()))
        val body =
            mvc
                .post("/api/missions") {
                    with(planner())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"name":"Op Nord","basemapId":"zone-nord","validUntil":"2099-01-01T00:00:00Z"}"""
                }.andReturn()
                .response.contentAsString
        missionId = JsonPath.read(body, "$.id")
        deviceA = TestDevices.insert(devices, 'a')
        deviceB = TestDevices.insert(devices, 'b')
        assignments.replace(UUID.fromString(missionId), setOf(deviceA.id))
        feature("Point de regroupement")
        mvc.post("/api/missions/$missionId/publish") { with(planner()) }.andExpect { status { isCreated() } }
    }

    private fun feature(name: String) {
        mvc
            .post("/api/missions/$missionId/features") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"kind":"GENERIC","geometry":{"type":"Point","coordinates":[2.0,48.0]},"name":"$name"}"""
            }.andExpect { status { isCreated() } }
    }

    private fun assign(vararg ids: UUID) =
        mvc.put("/api/missions/$missionId/devices") {
            with(planner())
            contentType = MediaType.APPLICATION_JSON
            content = """{"deviceIds":[${ids.joinToString(",") { "\"$it\"" }}]}"""
        }

    private fun latest() = versions.latest(UUID.fromString(missionId))!!

    private fun verify(device: Device) =
        PackageVerifier.verify(
            store.get(latest().objectKey).use { it.readBytes() },
            VerifyContext(device.certSha256, SoftwareKeyUnwrapper(TestDevices.keys.private), signingKey.publicKey, Instant.now(), { null }, { true }),
        )

    @Test
    fun `adding a device rebuilds the same version for it`() {
        assertEquals(Rejection.NOT_A_RECIPIENT, assertIs<VerifyResult.Rejected>(verify(deviceB)).reason)
        assign(deviceA.id, deviceB.id).andExpect { status { isOk() } }
        assertEquals(1, latest().number)
        assertEquals(2, latest().recipients)
        assertIs<VerifyResult.Accepted>(verify(deviceA))
        assertIs<VerifyResult.Accepted>(verify(deviceB))
    }

    @Test
    fun `a removed device no longer opens the package`() {
        assign(deviceA.id, deviceB.id)
        assign(deviceB.id)
        assertEquals(Rejection.NOT_A_RECIPIENT, assertIs<VerifyResult.Rejected>(verify(deviceA)).reason)
    }

    @Test
    fun `a rebuild keeps the published snapshot, not the current draft`() {
        feature("Brouillon non publie")
        assign(deviceA.id, deviceB.id)
        val mid = assertIs<VerifyResult.Accepted>(verify(deviceB)).payload.features.getValue(ZoomBand.MID)
        assertFalse(mid.contains("Brouillon non publie"))
        assertTrue(mid.contains("Point de regroupement"))
    }

    @Test
    fun `a published mission cannot lose all its devices`() {
        assign().andExpect { status { isConflict() } }
        assertEquals(listOf(deviceA.id), assignments.devices(UUID.fromString(missionId)).map { it.id })
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.publication.RepublishTest`
Expected: FAIL — packages are not rebuilt (`deviceB` stays `NOT_A_RECIPIENT`, recipients stays 1, the empty assignment returns 200).

- [ ] **Step 3: Write the implementation**

In `DeviceService`:
- add constructor parameters `private val publications: PublicationService` and `private val versions: MissionVersionRepository` (imports `geomap.server.publication.MissionVersionRepository`, `geomap.server.publication.PublicationService`);
- in `assign`, right after `assignments.replace(missionId, deviceIds)`, add:

```kotlin
        // Spec §5.6: devices of a published mission follow its latest version, rebuilt for the new list.
        versions.latest(missionId)?.let { publications.rebuild(actor, it) }
```

`rebuild` throws `ConflictException` when no enrolled device remains; being inside `assign`'s transaction, the assignment change rolls back with it.

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `RepublishTest` (4) and all earlier tests pass (including 2c-1's `AssignmentApiTest`, whose missions are never published).

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): rebuild the latest package when mission devices change"
```

---

### Task 4: Export for SD cards, withdrawal, deletion guard

**Files:**
- Modify: `server/src/main/kotlin/geomap/server/mission/MissionService.kt`, `server/src/main/kotlin/geomap/server/mission/MissionController.kt`, `server/src/main/kotlin/geomap/server/publication/PublicationService.kt`, `server/src/main/kotlin/geomap/server/publication/PublicationController.kt`
- Test: `server/src/test/kotlin/geomap/server/publication/ExportAndWithdrawTest.kt`

**Interfaces:**
- Consumes: Tasks 2–3; `MissionVersionRepository.latest/exists`; `ObjectStore.get`.
- Produces:
  - `PublicationService.export(actor, missionId): Pair<MissionVersion, ByteArray>` — humans only (403), 404 unknown mission or never published ("mission has never been published"), 409 withdrawn ("a withdrawn mission cannot be exported"); audit `mission.export` details `{"version": n}`
  - `GET /api/missions/{missionId}/package` (`planificateur`) → `application/octet-stream`, `Content-Disposition: attachment; filename="<missionId>-v<n>.gmp"`
  - `MissionService.withdraw(actor, id): Mission` — humans only (403); 404/409 via `editable` (already withdrawn → 409); sets `WITHDRAWN`; audit `mission.withdraw`; `POST /api/missions/{id}/withdraw` (`planificateur`)
  - `MissionService.delete` refuses a mission that has any version: 409 "a published mission cannot be deleted; withdraw it instead"

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/publication/ExportAndWithdrawTest.kt`:

```kotlin
package geomap.server.publication

import com.jayway.jsonpath.JsonPath
import geomap.pkg.PackageVerifier
import geomap.pkg.SoftwareKeyUnwrapper
import geomap.pkg.VerifyContext
import geomap.pkg.VerifyResult
import geomap.server.IntegrationTest
import geomap.server.TestDevices
import geomap.server.basemap.Basemap
import geomap.server.basemap.BasemapRepository
import geomap.server.device.AssignmentRepository
import geomap.server.device.Device
import geomap.server.device.DeviceRepository
import geomap.server.security.ServerSigningKey
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import java.time.Instant
import java.util.UUID
import kotlin.test.assertIs

class ExportAndWithdrawTest : IntegrationTest() {
    @Autowired private lateinit var basemaps: BasemapRepository

    @Autowired private lateinit var devices: DeviceRepository

    @Autowired private lateinit var assignments: AssignmentRepository

    @Autowired private lateinit var signingKey: ServerSigningKey

    private lateinit var missionId: String
    private lateinit var device: Device

    @BeforeEach
    fun mission() {
        basemaps.insert(Basemap("zone-nord", "Zone Nord", 1, "basemaps/zone-nord/x.pmtiles", "b".repeat(64), "c2ln", "root", Instant.now()))
        val body =
            mvc
                .post("/api/missions") {
                    with(planner())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"name":"Op Nord","basemapId":"zone-nord","validUntil":"2099-01-01T00:00:00Z"}"""
                }.andReturn()
                .response.contentAsString
        missionId = JsonPath.read(body, "$.id")
        device = TestDevices.insert(devices, 'a')
        assignments.replace(UUID.fromString(missionId), setOf(device.id))
        mvc.post("/api/missions/$missionId/features") {
            with(planner())
            contentType = MediaType.APPLICATION_JSON
            content = """{"kind":"GENERIC","geometry":{"type":"Point","coordinates":[2.0,48.0]},"name":"PC"}"""
        }
    }

    private fun publish() = mvc.post("/api/missions/$missionId/publish") { with(planner()) }.andExpect { status { isCreated() } }

    private fun export() = mvc.get("/api/missions/$missionId/package") { with(planner()) }

    @Test
    fun `exports the latest package for an SD card`() {
        publish()
        publish()
        val response =
            export()
                .andExpect {
                    status { isOk() }
                    content { contentType(MediaType.APPLICATION_OCTET_STREAM) }
                    header { string("Content-Disposition", "attachment; filename=\"$missionId-v2.gmp\"") }
                }.andReturn()
                .response
        val context =
            VerifyContext(device.certSha256, SoftwareKeyUnwrapper(TestDevices.keys.private), signingKey.publicKey, Instant.now(), { null }, { true })
        assertIs<VerifyResult.Accepted>(PackageVerifier.verify(response.contentAsByteArray, context))
    }

    @Test
    fun `an unpublished mission has nothing to export`() {
        export().andExpect { status { isNotFound() } }
    }

    @Test
    fun `withdrawing freezes the mission and stops exports`() {
        publish()
        mvc.post("/api/missions/$missionId/withdraw") { with(planner()) }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("WITHDRAWN") }
        }
        export().andExpect { status { isConflict() } }
        mvc.post("/api/missions/$missionId/withdraw") { with(planner()) }.andExpect { status { isConflict() } }
    }

    @Test
    fun `only a human withdraws or exports`() {
        publish()
        mvc.post("/api/missions/$missionId/withdraw") { with(agent()) }.andExpect { status { isForbidden() } }
        mvc.get("/api/missions/$missionId/package") { with(agent()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `a mission that was published cannot be deleted`() {
        publish()
        mvc
            .patch("/api/missions/$missionId") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op Nord bis"}"""
            }.andExpect { jsonPath("$.status") { value("DRAFT") } }
        mvc.delete("/api/missions/$missionId") { with(planner()) }.andExpect { status { isConflict() } }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.publication.ExportAndWithdrawTest`
Expected: FAIL — the `/package` and `/withdraw` routes do not exist, and the delete returns 204.

- [ ] **Step 3: Write the implementation**

In `PublicationService`, add (imports `geomap.server.mission.MissionStatus`, `geomap.server.web.NotFoundException`):

```kotlin
    @Transactional
    fun export(
        actor: Actor,
        missionId: UUID,
    ): Pair<MissionVersion, ByteArray> {
        if (actor.isAgent) throw ForbiddenException("only a human can export a mission")
        if (missions.get(missionId).status == MissionStatus.WITHDRAWN) throw ConflictException("a withdrawn mission cannot be exported")
        val latest = versions.latest(missionId) ?: throw NotFoundException("mission has never been published")
        val bytes = store.get(latest.objectKey).use { it.readBytes() }
        audit.record(AuditEvent(clock.instant(), actor.user, actor.agent, "mission.export", "mission:$missionId", mapOf("version" to latest.number)))
        return latest to bytes
    }
```

In `PublicationController`, add (imports `org.springframework.http.ContentDisposition`, `org.springframework.http.HttpHeaders`, `org.springframework.http.MediaType`, `org.springframework.http.ResponseEntity`):

```kotlin
    @GetMapping("/package")
    fun export(
        @PathVariable missionId: UUID,
        authentication: Authentication,
    ): ResponseEntity<ByteArray> {
        val (version, bytes) = service.export(Actor.of(authentication), missionId)
        val disposition = ContentDisposition.attachment().filename("$missionId-v${version.number}.gmp").build()
        return ResponseEntity
            .ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
            .body(bytes)
    }
```

In `MissionService`:
- add the constructor parameter `private val versions: MissionVersionRepository` (import `geomap.server.publication.MissionVersionRepository`);
- in `delete`, right after the agent check, add `if (versions.exists(id)) throw ConflictException("a published mission cannot be deleted; withdraw it instead")`;
- add:

```kotlin
    @Transactional
    fun withdraw(
        actor: Actor,
        id: UUID,
    ): Mission {
        if (actor.isAgent) throw ForbiddenException("only a human can withdraw a mission")
        val mission = editable(id)
        missions.update(mission.copy(status = MissionStatus.WITHDRAWN, updatedBy = actor.user, updatedAt = clock.instant()))
        record(actor, "mission.withdraw", "mission:$id")
        return get(id)
    }
```

In `MissionController`, add:

```kotlin
    @PostMapping("/{id}/withdraw")
    fun withdraw(
        @PathVariable id: UUID,
        authentication: Authentication,
    ): Mission = service.withdraw(Actor.of(authentication), id)
```

(`MissionService` → `MissionVersionRepository` and `PublicationService` → `MissionService` form no bean cycle: the repository depends on neither service.)

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `ExportAndWithdrawTest` (5) and all earlier tests pass.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): export packages for SD cards and withdraw missions"
```
