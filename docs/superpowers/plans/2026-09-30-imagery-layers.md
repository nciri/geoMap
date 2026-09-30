# Imagery Layers (Satellite View) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a planner stack offline imagery (raster PMTiles) under the vector basemap of a mission and switch between Carte, Satellite and Hybride views in the web app; give administrators a tool to prepare imagery from IGN or local GeoTIFF/JP2 files.

**Architecture:** The server reads each uploaded PMTiles header to classify it `VECTOR` or `RASTER` (refusing non-PMTiles files) and keeps its attribution and bounds. A mission's single `basemapId` becomes an ordered `layers` list (one vector basemap first, then rasters), stored as a PostgreSQL text array; the validator and publication use the vector layer; imagery is not packaged yet. The web app builds one MapLibre style holding the Protomaps "base" layers, one raster layer per imagery, and the Protomaps "overlay" layers (roads, boundaries, labels), and switches modes by toggling layer visibility. A Python tool outside the product turns IGN WMTS tiles or GDAL-readable rasters into PMTiles.

**Tech Stack:** Kotlin 2.2.20, Spring Boot 4.1.0, Flyway, Jackson 3, PostgreSQL, MinIO; React 19.3, MapLibre GL JS 6.11.2, pmtiles 4.5.0, @protomaps/basemaps 5.7.2, Vitest/msw, Playwright 1.63; Python 3 (standard library) + `pmtiles` CLI 1.31.2 + GDAL (optional input).

**Spec:** `docs/superpowers/specs/2026-09-30-geomap-imagery-design.md`

**Branch:** `feature/imagery` (from `main`, spec commit 1bf3c7a).

## Global Constraints

- Everything from the V1 plans still applies (air gap, runtime `/config.json`, token never logged nor in `localStorage`, UI French / code English, exact version pins, RED test first, `make check` single gate, `make e2e` separate). **No AI attribution in commit messages — no `Co-Authored-By` or "Generated with" line of any kind.**
- PMTiles v3 header: 127 bytes, little-endian; magic `PMTiles` + version byte `3`; metadata offset at byte 24 (uint64) and length at 32 (uint64); internal compression at byte 97 (`1` none, `2` gzip, others unsupported); tile type at byte 99 (`1` MVT → `VECTOR`; `2` PNG, `3` JPEG, `4` WebP, `5` AVIF → `RASTER`; anything else → refused); min lon/lat and max lon/lat as int32 × 10⁻⁷ at bytes 102, 106, 110, 114.
- A file that is not a readable PMTiles v3 (short, wrong magic or version, unknown tile type) is refused at upload with 400 `the file is not a valid PMTiles archive`; nothing is stored.
- Attribution is read from the metadata JSON key `attribution`, HTML tags stripped, trimmed; empty when absent, unreadable or compressed with anything but none/gzip.
- Mission `layers`: ordered basemap ids; at most one `VECTOR`, which must be first; no duplicates; every id exists (400 otherwise, messages in English like other API errors). Publishing needs a vector layer (`NO_BASEMAP`).
- New validator warning `IMAGERY_OUT_OF_AREA` (French label « Imagerie hors de la zone des objets ») when a raster layer's bounds do not intersect the union of the published objects' bounding boxes.
- The `.gmp` package format and the device side do not change in this plan.
- Web map modes: `Carte` (base + overlay, rasters hidden), `Satellite` (base + rasters, overlay hidden), `Hybride` (base + rasters + overlay). Overlay = Protomaps layers of type `symbol` or whose id starts with `roads_` or `boundaries`; base = every other Protomaps layer. Mission objects and APP-6D layers stay above all of them. Mode kept per browser in `localStorage` key `geomap.mapMode` (read/write wrapped in try/catch).
- The imagery tool never runs on the air-gapped server; it refuses to write without `--attribution`, estimates tiles and volume first, and caps at 50 000 tiles unless `--max-tiles` raises it.

## Review Focus

- A non-PMTiles or truncated file must be refused before anything is stored, and an MVT/JPEG archive must be classified correctly. (Tasks 1–2 tests.)
- Existing missions and basemaps must survive the migrations: a mission's former basemap becomes its single layer; a basemap uploaded before this plan gets its kind, bounds and attribution filled in at startup. (Tasks 2–3 tests.)
- Publication must keep packaging the vector basemap, never an imagery layer, whatever the layer order the client sends. (Task 3 tests.)
- Switching modes must never remove the mission objects or APP-6D layers, and a mission without imagery must keep Satellite/Hybride disabled. (Task 5 tests + Task 7 journey.)
- An unreadable imagery layer must show a French alert naming it without breaking the others. (Task 5.)

## File Structure

| File | Responsibility |
|---|---|
| `server/.../basemap/PmtilesHeader.kt` | header and attribution parsing (pure) |
| `server/.../basemap/{Basemap,BasemapService,BasemapBackfill}.kt`, `db/migration/V5__basemap_kind.sql` | kind, attribution, bounds; upload validation; startup backfill |
| `server/.../mission/{Mission,MissionRepository,MissionService,MissionValidator}.kt`, `db/migration/V6__mission_layers.sql` | `layers` list, rules, validator |
| `server/.../publication/PublicationService.kt` | vector layer used for packages |
| `server/src/test/kotlin/geomap/server/TestPmtiles.kt` | valid PMTiles bytes for tests |
| `web/src/api/geomap.ts`, `web/src/missions/MissionForm.tsx`, `web/src/admin/BasemapsPage.tsx`, `web/src/editor/*` | types, "Couches" section, admin columns |
| `web/src/map/{style.ts,mapModes.ts,MapView.tsx,ModeSwitch.tsx}` | style with rasters, mode visibility, switch |
| `tools/imagery/**` | imagery preparation tool (Python) |
| `web/e2e/fixtures/*.pmtiles`, `web/e2e/imagery.spec.ts` | real PMTiles fixtures, satellite journey |

---

### Task 1: Read PMTiles headers on the server

**Files:**
- Create: `server/src/main/kotlin/geomap/server/basemap/PmtilesHeader.kt`
- Create: `server/src/test/kotlin/geomap/server/TestPmtiles.kt`
- Test: `server/src/test/kotlin/geomap/server/basemap/PmtilesHeaderTest.kt`

**Interfaces:**
- Produces: `enum class BasemapKind { VECTOR, RASTER }`; `data class PmtilesHeader(kind: BasemapKind, bounds: BBox, metadataOffset: Long, metadataLength: Long, internalCompression: Int)` with `companion object { const val SIZE = 127; fun parse(bytes: ByteArray): PmtilesHeader?; fun attribution(metadata: ByteArray, internalCompression: Int, json: ObjectMapper): String }`. `BBox` is `geomap.server.mission.BBox`.
- Test helper `object TestPmtiles { fun build(tileType: Int = 1, bounds: BBox = BBox(2.0, 48.0, 3.0, 49.0), attribution: String? = "© OpenStreetMap", size: Int = 4096, seed: Int = 1, gzipMetadata: Boolean = true): ByteArray }` — a valid header, the metadata JSON right after it (offset 127), then random bytes up to `size`.

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/TestPmtiles.kt`:

```kotlin
package geomap.server

import geomap.server.mission.BBox
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.GZIPOutputStream
import kotlin.random.Random

// Header + metadata of a real PMTiles v3 archive; the server never reads the tiles themselves.
object TestPmtiles {
    fun build(
        tileType: Int = 1,
        bounds: BBox = BBox(2.0, 48.0, 3.0, 49.0),
        attribution: String? = "© OpenStreetMap",
        size: Int = 4096,
        seed: Int = 1,
        gzipMetadata: Boolean = true,
    ): ByteArray {
        val json = attribution?.let { """{"name":"test","attribution":${quote(it)}}""" } ?: """{"name":"test"}"""
        val metadata = if (gzipMetadata) gzip(json.toByteArray()) else json.toByteArray()
        val header = ByteBuffer.allocate(127).order(ByteOrder.LITTLE_ENDIAN)
        header.put("PMTiles".toByteArray(Charsets.US_ASCII)).put(3)
        header.putLong(8, 127L + metadata.size).putLong(16, 0)
        header.putLong(24, 127).putLong(32, metadata.size.toLong())
        header.put(97, if (gzipMetadata) 2 else 1).put(98, 1).put(99, tileType.toByte())
        header.putInt(102, (bounds.minLon * 1e7).toInt()).putInt(106, (bounds.minLat * 1e7).toInt())
        header.putInt(110, (bounds.maxLon * 1e7).toInt()).putInt(114, (bounds.maxLat * 1e7).toInt())
        val body = header.array() + metadata
        return body + Random(seed).nextBytes(maxOf(0, size - body.size))
    }

    private fun quote(text: String) = "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

    private fun gzip(bytes: ByteArray): ByteArray = ByteArrayOutputStream().also { out -> GZIPOutputStream(out).use { it.write(bytes) } }.toByteArray()
}
```

`server/src/test/kotlin/geomap/server/basemap/PmtilesHeaderTest.kt`:

```kotlin
package geomap.server.basemap

import geomap.server.TestPmtiles
import geomap.server.mission.BBox
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class PmtilesHeaderTest {
    private val json = JsonMapper.builder().build()

    private fun header(bytes: ByteArray) = assertNotNull(PmtilesHeader.parse(bytes.copyOf(PmtilesHeader.SIZE)))

    private fun metadata(
        bytes: ByteArray,
        h: PmtilesHeader,
    ) = bytes.copyOfRange(h.metadataOffset.toInt(), (h.metadataOffset + h.metadataLength).toInt())

    @Test
    fun `classifies vector and raster archives`() {
        assertEquals(BasemapKind.VECTOR, header(TestPmtiles.build(tileType = 1)).kind)
        for (type in 2..5) assertEquals(BasemapKind.RASTER, header(TestPmtiles.build(tileType = type)).kind)
    }

    @Test
    fun `reads bounds in degrees`() {
        val h = header(TestPmtiles.build(bounds = BBox(2.2, 48.78, 2.47, 48.94)))
        assertEquals(2.2, h.bounds.minLon, 1e-6)
        assertEquals(48.78, h.bounds.minLat, 1e-6)
        assertEquals(2.47, h.bounds.maxLon, 1e-6)
        assertEquals(48.94, h.bounds.maxLat, 1e-6)
    }

    @Test
    fun `refuses what is not a PMTiles v3 archive`() {
        assertNull(PmtilesHeader.parse(ByteArray(127)))
        assertNull(PmtilesHeader.parse(TestPmtiles.build().copyOf(100)))
        assertNull(PmtilesHeader.parse(TestPmtiles.build(tileType = 0).copyOf(127)))
        assertNull(PmtilesHeader.parse(TestPmtiles.build().copyOf(127).also { it[7] = 2 }))
    }

    @Test
    fun `reads the attribution as plain text from gzip or raw metadata`() {
        val html = TestPmtiles.build(attribution = "<a href=\"https://openstreetmap.org\">© OpenStreetMap</a> ")
        val h = header(html)
        assertEquals("© OpenStreetMap", PmtilesHeader.attribution(metadata(html, h), h.internalCompression, json))
        val raw = TestPmtiles.build(attribution = "© IGN", gzipMetadata = false)
        val r = header(raw)
        assertEquals("© IGN", PmtilesHeader.attribution(metadata(raw, r), r.internalCompression, json))
    }

    @Test
    fun `an absent or unreadable attribution is empty`() {
        val none = TestPmtiles.build(attribution = null)
        val h = header(none)
        assertEquals("", PmtilesHeader.attribution(metadata(none, h), h.internalCompression, json))
        assertEquals("", PmtilesHeader.attribution(byteArrayOf(1, 2, 3), 2, json))
        assertEquals("", PmtilesHeader.attribution(byteArrayOf(1, 2, 3), 3, json))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ./gradlew test --tests 'geomap.server.basemap.PmtilesHeaderTest'`
Expected: FAIL — `Unresolved reference 'PmtilesHeader'`.

- [ ] **Step 3: Write minimal implementation**

`server/src/main/kotlin/geomap/server/basemap/PmtilesHeader.kt`:

```kotlin
package geomap.server.basemap

import geomap.server.mission.BBox
import tools.jackson.databind.ObjectMapper
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.GZIPInputStream

enum class BasemapKind { VECTOR, RASTER }

data class PmtilesHeader(
    val kind: BasemapKind,
    val bounds: BBox,
    val metadataOffset: Long,
    val metadataLength: Long,
    val internalCompression: Int,
) {
    companion object {
        const val SIZE = 127
        private val MAGIC = "PMTiles".toByteArray(Charsets.US_ASCII)

        fun parse(bytes: ByteArray): PmtilesHeader? {
            if (bytes.size < SIZE || !bytes.copyOfRange(0, MAGIC.size).contentEquals(MAGIC) || bytes[7].toInt() != 3) return null
            val kind =
                when (bytes[99].toInt()) {
                    1 -> BasemapKind.VECTOR
                    2, 3, 4, 5 -> BasemapKind.RASTER
                    else -> return null
                }
            val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)

            fun degrees(at: Int) = buffer.getInt(at) / 1e7
            return PmtilesHeader(
                kind = kind,
                bounds = BBox(degrees(102), degrees(106), degrees(110), degrees(114)),
                metadataOffset = buffer.getLong(24),
                metadataLength = buffer.getLong(32),
                internalCompression = bytes[97].toInt(),
            )
        }

        // Protomaps builds put an HTML link in the attribution; the UI shows plain text.
        fun attribution(
            metadata: ByteArray,
            internalCompression: Int,
            json: ObjectMapper,
        ): String =
            try {
                val raw =
                    when (internalCompression) {
                        1 -> metadata
                        2 -> GZIPInputStream(metadata.inputStream()).use { it.readBytes() }
                        else -> return ""
                    }
                val value = json.readTree(raw).get("attribution")?.asString() ?: ""
                value.replace(Regex("<[^>]*>"), "").trim()
            } catch (e: Exception) {
                ""
            }
    }
}
```

(If Jackson 3's `JsonNode` exposes the text accessor under another name — `asText()` / `stringValue()` — use it and note it in the report.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ./gradlew test --tests 'geomap.server.basemap.PmtilesHeaderTest'`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the server gate and commit**

Run: `cd server && ./gradlew check`
Expected: BUILD SUCCESSFUL.

```bash
git add server
git commit -m "feat(server): read PMTiles headers to classify basemaps"
```

---

### Task 2: Basemap kind, attribution and bounds; refuse non-PMTiles uploads

**Files:**
- Create: `server/src/main/resources/db/migration/V5__basemap_kind.sql`, `server/src/main/kotlin/geomap/server/basemap/BasemapBackfill.kt`
- Modify: `server/src/main/kotlin/geomap/server/basemap/Basemap.kt`, `BasemapService.kt`
- Modify tests that upload or insert basemaps with raw bytes: `basemap/BasemapApiTest.kt`, `basemap/BasemapTilesTest.kt`, and any other test uploading random bytes as a basemap
- Test: `server/src/test/kotlin/geomap/server/basemap/BasemapKindTest.kt`

**Interfaces:**
- Consumes: `PmtilesHeader`, `BasemapKind`, `TestPmtiles` (Task 1).
- Produces: `Basemap` gains `kind: BasemapKind = BasemapKind.VECTOR`, `attribution: String = ""`, `bounds: BBox? = null` (after `createdAt`, with defaults so existing fixtures stay short). `GET /api/basemaps` returns them. Upload refuses non-PMTiles with 400 `the file is not a valid PMTiles archive` before storing anything. `BasemapService.backfill()` and `BasemapBackfill` (an `ApplicationRunner`) fill kind, bounds and attribution of rows whose `min_lon` is NULL by reading their stored header; an unreadable object is logged (id only) and left `VECTOR`.

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/basemap/BasemapKindTest.kt`:

```kotlin
package geomap.server.basemap

import geomap.server.IntegrationTest
import geomap.server.TestPmtiles
import geomap.server.mission.BBox
import geomap.server.storage.ObjectStore
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.put
import java.sql.Timestamp
import java.time.Instant
import kotlin.random.Random
import kotlin.test.assertEquals
import kotlin.test.assertNull

class BasemapKindTest : IntegrationTest() {
    @Autowired
    private lateinit var basemaps: BasemapRepository

    @Autowired
    private lateinit var store: ObjectStore

    @Autowired
    private lateinit var backfill: BasemapBackfill

    private fun upload(
        id: String,
        bytes: ByteArray,
    ) = mvc.put("/api/basemaps/$id?name=Test") {
        with(admin())
        contentType = MediaType.APPLICATION_OCTET_STREAM
        content = bytes
    }

    @Test
    fun `an imagery archive is registered as raster with its attribution and bounds`() {
        upload("paris-ortho", TestPmtiles.build(tileType = 3, bounds = BBox(2.2, 48.78, 2.47, 48.94), attribution = "© IGN BD ORTHO"))
            .andExpect {
                status { isCreated() }
                jsonPath("$.kind") { value("RASTER") }
                jsonPath("$.attribution") { value("© IGN BD ORTHO") }
                jsonPath("$.bounds.minLon") { value(2.2) }
            }
    }

    @Test
    fun `a vector archive is registered as vector`() {
        upload("zone-nord", TestPmtiles.build(tileType = 1)).andExpect {
            status { isCreated() }
            jsonPath("$.kind") { value("VECTOR") }
        }
    }

    @Test
    fun `a file that is not a PMTiles archive is refused and nothing is stored`() {
        upload("junk", Random(3).nextBytes(5000)).andExpect {
            status { isBadRequest() }
            jsonPath("$.detail") { value("the file is not a valid PMTiles archive") }
        }
        assertNull(basemaps.find("junk"))
    }

    @Test
    fun `basemaps registered before this change get their kind and bounds at startup`() {
        val bytes = TestPmtiles.build(tileType = 4, bounds = BBox(1.0, 2.0, 3.0, 4.0), attribution = "© ALIAS")
        store.put("basemaps/old/1.pmtiles", bytes.inputStream(), bytes.size.toLong(), "application/vnd.pmtiles")
        jdbc
            .sql(
                """
                INSERT INTO basemap (id, name, size_bytes, object_key, sha256, signature, created_by, created_at)
                VALUES ('old', 'Old', :size, 'basemaps/old/1.pmtiles', :sha, 'sig', 'root', :at)
                """.trimIndent(),
            ).param("size", bytes.size)
            .param("sha", "d".repeat(64))
            .param("at", Timestamp.from(Instant.now()))
            .update()
        backfill.run(DefaultApplicationArguments())
        val old = basemaps.find("old")!!
        assertEquals(BasemapKind.RASTER, old.kind)
        assertEquals("© ALIAS", old.attribution)
        assertEquals(BBox(1.0, 2.0, 3.0, 4.0), old.bounds)
    }
}
```

(Adapt the raw insert to how `IntegrationTest` exposes `jdbc` and to the column types; keep the intent: a row inserted without the new columns, like a pre-migration row.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ./gradlew test --tests 'geomap.server.basemap.BasemapKindTest'`
Expected: FAIL — no `kind` in the JSON, junk accepted, `BasemapBackfill` unresolved.

- [ ] **Step 3: Write minimal implementation**

`server/src/main/resources/db/migration/V5__basemap_kind.sql`:

```sql
ALTER TABLE basemap
    ADD COLUMN kind        TEXT NOT NULL DEFAULT 'VECTOR' CHECK (kind IN ('VECTOR', 'RASTER')),
    ADD COLUMN attribution TEXT NOT NULL DEFAULT '',
    ADD COLUMN min_lon     DOUBLE PRECISION,
    ADD COLUMN min_lat     DOUBLE PRECISION,
    ADD COLUMN max_lon     DOUBLE PRECISION,
    ADD COLUMN max_lat     DOUBLE PRECISION;
```

`Basemap.kt`: add the three properties, write them in `insert`, read them in `map` (`bounds` is null when `min_lon` is SQL NULL), and add:

```kotlin
    fun findWithoutBounds(): List<Basemap> = jdbc.sql("SELECT * FROM basemap WHERE min_lon IS NULL").query { rs, _ -> map(rs) }.list()

    fun updateDescription(
        id: String,
        kind: BasemapKind,
        attribution: String,
        bounds: BBox,
    ) {
        jdbc
            .sql(
                """
                UPDATE basemap SET kind = :kind, attribution = :attribution,
                    min_lon = :minLon, min_lat = :minLat, max_lon = :maxLon, max_lat = :maxLat
                WHERE id = :id
                """.trimIndent(),
            ).param("id", id)
            .param("kind", kind.name)
            .param("attribution", attribution)
            .param("minLon", bounds.minLon)
            .param("minLat", bounds.minLat)
            .param("maxLon", bounds.maxLon)
            .param("maxLat", bounds.maxLat)
            .update()
    }
```

`BasemapService.kt` (inject the Jackson `ObjectMapper`; add a logger):

- a private helper reading the stored description:

```kotlin
    private fun describe(objectKey: String): Pair<PmtilesHeader, String>? {
        val header =
            store.getRange(objectKey, 0, PmtilesHeader.SIZE.toLong()).use { PmtilesHeader.parse(it.readNBytes(PmtilesHeader.SIZE)) }
                ?: return null
        // Metadata larger than this cannot be an attribution worth reading.
        val attribution =
            if (header.metadataLength in 1..MAX_METADATA) {
                store.getRange(objectKey, header.metadataOffset, header.metadataLength).use {
                    PmtilesHeader.attribution(it.readAllBytes(), header.internalCompression, json)
                }
            } else {
                ""
            }
        return header to attribution
    }
```

  with `private const val MAX_METADATA = 1_048_576L` in the companion;
- in `upload`, before `store.put`: wrap `content` in a `BufferedInputStream`, `mark(PmtilesHeader.SIZE)`, `readNBytes(PmtilesHeader.SIZE)`, `reset()`; when `PmtilesHeader.parse(...)` is null throw `InvalidInputException("the file is not a valid PMTiles archive")` (nothing stored); upload the buffered stream; after `store.put`, call `describe(objectKey)` for the attribution and build the `Basemap` with `kind`, `attribution` and `bounds` from the header;
- `fun backfill()`: for each `basemaps.findWithoutBounds()`, call `describe` and `updateDescription`; when it returns null or throws, log `basemap <id>: header unreadable, kept as VECTOR` and continue.

`BasemapBackfill.kt`:

```kotlin
package geomap.server.basemap

import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.stereotype.Component

// Basemaps uploaded before kinds existed get theirs from the stored file, once, at startup.
@Component
class BasemapBackfill(
    private val service: BasemapService,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) = service.backfill()
}
```

Update every existing test that uploads random bytes as a basemap to upload `TestPmtiles.build(size = <old size>, seed = <old seed>)` instead (`BasemapApiTest`, `BasemapTilesTest` which slices the stored bytes — keep sizes so range assertions still hold; any other upload found by `grep -rn "api/basemaps" server/src/test`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && ./gradlew test`
Expected: PASS — the 4 new tests and every existing test.

- [ ] **Step 5: Run the server gate and commit**

Run: `cd server && ./gradlew check`
Expected: BUILD SUCCESSFUL.

```bash
git add server
git commit -m "feat(server): classify basemaps as vector or imagery and refuse non-PMTiles files"
```

---

### Task 3: Mission layers

**Files:**
- Create: `server/src/main/resources/db/migration/V6__mission_layers.sql`
- Modify: `server/src/main/kotlin/geomap/server/mission/{Mission.kt,MissionRepository.kt,MissionService.kt,MissionValidator.kt}`, `server/src/main/kotlin/geomap/server/publication/PublicationService.kt`
- Modify every server test using `basemapId` (`MissionApiTest`, `MissionValidationTest`, `RepositoryTest`, `MissionConcurrencyTest`, `publication/*Test.kt`)
- Test: `server/src/test/kotlin/geomap/server/mission/MissionLayersTest.kt`

**Interfaces:**
- Consumes: `Basemap.kind`, `Basemap.bounds` (Task 2).
- Produces: `Mission.layers: List<String>` replaces `basemapId`; `MissionInput(name, layers: List<String>? = null, validUntil)`, `MissionPatch(name, layers: List<String>? = null, validUntil)` — a `null` list leaves layers unchanged, an empty list clears them. Rules (400): each id matches `^[a-z0-9-]{1,64}$`; exists (`unknown basemap <id>`); no duplicate (`basemap <id> is listed twice`); at most one `VECTOR` (`a mission has at most one vector basemap`), and it must be first (`the vector basemap must come first`). Validator: `NO_BASEMAP` when the first layer is not an existing `VECTOR` basemap; `UNKNOWN_BASEMAP` per missing id; warning `IMAGERY_OUT_OF_AREA` per raster whose bounds miss the published objects' union bbox (skipped without objects or bounds). Publication packages the first layer.

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/mission/MissionLayersTest.kt`:

```kotlin
package geomap.server.mission

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import geomap.server.TestPmtiles
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

class MissionLayersTest : IntegrationTest() {
    @BeforeEach
    fun basemaps() {
        upload("zone-nord", TestPmtiles.build(tileType = 1))
        upload("zone-sud", TestPmtiles.build(tileType = 1, seed = 2))
        upload("paris-ortho", TestPmtiles.build(tileType = 3, bounds = BBox(2.2, 48.78, 2.47, 48.94)))
        upload("lyon-ortho", TestPmtiles.build(tileType = 3, bounds = BBox(4.7, 45.7, 4.95, 45.85), seed = 3))
    }

    private fun upload(
        id: String,
        bytes: ByteArray,
    ) = mvc
        .put("/api/basemaps/$id?name=$id") {
            with(admin())
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = bytes
        }.andExpect { status { isCreated() } }

    private fun create(layers: String) =
        mvc.post("/api/missions") {
            with(planner())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Op Nord","layers":$layers}"""
        }

    private fun idOf(layers: String): String = JsonPath.read(create(layers).andReturn().response.contentAsString, "$.id")

    @Test
    fun `a mission stacks a vector basemap and imagery in order`() {
        create("""["zone-nord","paris-ortho","lyon-ortho"]""").andExpect {
            status { isCreated() }
            jsonPath("$.layers[0]") { value("zone-nord") }
            jsonPath("$.layers[2]") { value("lyon-ortho") }
        }
    }

    @Test
    fun `layer rules are enforced`() {
        create("""["paris-ortho","zone-nord"]""").andExpect { status { isBadRequest() } }
        create("""["zone-nord","zone-sud"]""").andExpect { status { isBadRequest() } }
        create("""["zone-nord","paris-ortho","paris-ortho"]""").andExpect { status { isBadRequest() } }
        create("""["zone-nord","nowhere"]""").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `patching layers replaces the list, omitting them keeps it`() {
        val id = idOf("""["zone-nord"]""")
        mvc
            .patch("/api/missions/$id") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"layers":["zone-nord","paris-ortho"]}"""
            }.andExpect { jsonPath("$.layers.length()") { value(2) } }
        mvc
            .patch("/api/missions/$id") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op Nord 2"}"""
            }.andExpect { jsonPath("$.layers[1]") { value("paris-ortho") } }
    }

    @Test
    fun `a mission without a vector basemap cannot publish and far imagery is flagged`() {
        val id = idOf("""["zone-nord","lyon-ortho"]""")
        mvc.post("/api/missions/$id/features") {
            with(planner())
            contentType = MediaType.APPLICATION_JSON
            content = """{"kind":"GENERIC","geometry":{"type":"Point","coordinates":[2.35,48.85]}}"""
        }
        mvc.get("/api/missions/$id/validation") { with(planner()) }.andExpect {
            jsonPath("$.warnings[?(@.code == 'IMAGERY_OUT_OF_AREA')]") { exists() }
        }
        val bare = idOf("[]")
        mvc.get("/api/missions/$bare/validation") { with(planner()) }.andExpect {
            jsonPath("$.errors[?(@.code == 'NO_BASEMAP')]") { exists() }
        }
    }
}
```

In `PublicationApiTest`, add a test: a mission with layers `["zone-nord","paris-ortho"]` (plus the usual expiry, device and object) publishes a package whose header `basemap.id` is `zone-nord` (reuse that file's publishing helpers and verifier).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ./gradlew test --tests 'geomap.server.mission.MissionLayersTest'`
Expected: FAIL — `layers` unknown.

- [ ] **Step 3: Write minimal implementation**

`server/src/main/resources/db/migration/V6__mission_layers.sql`:

```sql
ALTER TABLE mission ADD COLUMN layers TEXT[] NOT NULL DEFAULT '{}';
UPDATE mission SET layers = ARRAY[basemap_id] WHERE basemap_id IS NOT NULL;
ALTER TABLE mission DROP COLUMN basemap_id;
```

- `Mission.kt`: replace `basemapId: String?` with `layers: List<String>`.
- `MissionRepository.kt`: write `layers` (`.param("layers", mission.layers.toTypedArray())` — the PostgreSQL driver maps `String[]` to `text[]`; if it does not, create the array from the connection) and read it with `(rs.getArray("layers").array as Array<*>).map { it as String }`.
- `MissionService.kt`: inject `BasemapRepository`; `MissionInput.layers` / `MissionPatch.layers` replace `basemapId`; `validLayers(ids)` applies the rules above; the audit field name becomes `layers`; remove `validBasemapId`.
- `MissionValidator.kt`: replace the basemap block with:

```kotlin
        val layers = mission.layers.map { it to basemaps.find(it) }
        layers.filter { it.second == null }.forEach { (id, _) ->
            errors += ValidationIssue("UNKNOWN_BASEMAP", "basemap $id is not registered")
        }
        if (layers.firstOrNull()?.second?.kind != BasemapKind.VECTOR) {
            errors += ValidationIssue("NO_BASEMAP", "mission has no vector basemap")
        }
        val area =
            published.map { it.bbox }.reduceOrNull { a, b ->
                BBox(minOf(a.minLon, b.minLon), minOf(a.minLat, b.minLat), maxOf(a.maxLon, b.maxLon), maxOf(a.maxLat, b.maxLat))
            }
        layers.mapNotNull { it.second }.filter { it.kind == BasemapKind.RASTER }.forEach { imagery ->
            val bounds = imagery.bounds
            if (area != null && bounds != null && !intersects(area, bounds)) {
                warnings += ValidationIssue("IMAGERY_OUT_OF_AREA", "imagery ${imagery.id} does not cover the mission objects")
            }
        }
```

  with `private fun intersects(a: BBox, b: BBox) = a.minLon <= b.maxLon && b.minLon <= a.maxLon && a.minLat <= b.maxLat && b.minLat <= a.maxLat`. (`warnings` must be declared before this block.)
- `PublicationService.kt`: `val basemap = basemaps.find(mission.layers.first())!!` with the comment `// The validator guarantees an existing vector basemap first; imagery is not packaged yet (spec §3.4).`

Update every server test that used `basemapId` (`"basemapId":"zone-nord"` → `"layers":["zone-nord"]`; `Mission(... basemapId = x ...)` → `layers = listOf(x)`), and the existing `NO_BASEMAP` expectations if they assert its message.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && ./gradlew test`
Expected: PASS.

- [ ] **Step 5: Run the server gate and commit**

Run: `cd server && ./gradlew check`
Expected: BUILD SUCCESSFUL.

```bash
git add server
git commit -m "feat(server): order a mission's basemap and imagery as layers"
```

---

### Task 4: Web — layer types, "Couches" section and administration columns

**Files:**
- Modify: `web/src/api/geomap.ts`, `web/src/test/fixtures.ts`, `web/src/missions/MissionForm.tsx`, `web/src/editor/MissionEditorPage.tsx`, `web/src/editor/PublicationPanel.tsx`, `web/src/admin/BasemapsPage.tsx`, and every web test using `basemapId`
- Test: `web/src/missions/MissionForm.test.tsx` (create), `web/src/admin/BasemapsPage.test.tsx`

**Interfaces:**
- Produces: `Mission.layers: string[]` (replaces `basemapId`); `MissionInput.layers?: string[]`; `Basemap` gains `kind: "VECTOR" | "RASTER"`, `attribution: string`, `bounds: BBox | null`. `MissionForm` keeps the "Fond de carte" select (vector basemaps only) and adds an "Imagerie" list: select "Ajouter une imagerie" (raster basemaps not yet listed, placeholder "— choisir —"), and per imagery its name, attribution and buttons "Monter <nom>", "Descendre <nom>", "Retirer <nom>" (accessible names). Submits `layers = [vector, ...imagery]` (vector omitted when "— aucun —"). `VALIDATION_LABELS.IMAGERY_OUT_OF_AREA = "Imagerie hors de la zone des objets"`. The admin table gains "Type" (`Vectoriel` / `Imagerie`) and "Attribution" columns. `MissionEditorPage` keeps passing a single vector id to `MapView` until Task 5.

- [ ] **Step 1: Write the failing test**

`web/src/missions/MissionForm.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { basemap, mission } from "../test/fixtures";
import { MissionForm } from "./MissionForm";

const vector = basemap({ id: "zone-nord", name: "Zone Nord", kind: "VECTOR" });
const paris = basemap({ id: "paris-ortho", name: "Paris ortho", kind: "RASTER", attribution: "© IGN" });
const lyon = basemap({ id: "lyon-ortho", name: "Lyon ortho", kind: "RASTER", attribution: "© IGN" });

function serve() {
  server.use(http.get("/api/basemaps", () => HttpResponse.json([vector, paris, lyon])));
}

it("stacks imagery under the vector basemap in the chosen order", async () => {
  serve();
  const onSubmit = vi.fn(async () => {});
  renderWithProviders(
    <MissionForm
      initial={mission({ layers: ["zone-nord"] })}
      submitLabel="Enregistrer"
      onSubmit={onSubmit}
    />,
  );
  const user = userEvent.setup();
  await screen.findByRole("option", { name: "Paris ortho" });
  await user.selectOptions(screen.getByLabelText("Ajouter une imagerie"), "paris-ortho");
  await user.selectOptions(screen.getByLabelText("Ajouter une imagerie"), "lyon-ortho");
  expect(screen.getAllByText(/© IGN/).length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Monter Lyon ortho" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ layers: ["zone-nord", "lyon-ortho", "paris-ortho"] }),
    ),
  );
});

it("offers only vector basemaps as the base and only imagery as layers", async () => {
  serve();
  renderWithProviders(<MissionForm submitLabel="Créer la mission" onSubmit={vi.fn()} />);
  await screen.findByRole("option", { name: "Zone Nord" });
  expect(screen.getByLabelText("Fond de carte")).not.toHaveTextContent("Paris ortho");
  expect(screen.getByLabelText("Ajouter une imagerie")).not.toHaveTextContent("Zone Nord");
});

it("removes an imagery layer", async () => {
  serve();
  const onSubmit = vi.fn(async () => {});
  renderWithProviders(
    <MissionForm
      initial={mission({ layers: ["zone-nord", "paris-ortho"] })}
      submitLabel="Enregistrer"
      onSubmit={onSubmit}
    />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Retirer Paris ortho" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ layers: ["zone-nord"] })),
  );
});
```

Add to `web/src/admin/BasemapsPage.test.tsx`:

```tsx
it("shows each basemap's type and attribution", async () => {
  server.use(
    http.get("/api/basemaps", () =>
      HttpResponse.json([
        basemap({ kind: "VECTOR", attribution: "© OpenStreetMap" }),
        basemap({ id: "paris-ortho", name: "Paris ortho", kind: "RASTER", attribution: "© IGN" }),
      ]),
    ),
  );
  renderWithProviders(<BasemapsPage />);
  expect(await screen.findByText("Imagerie")).toBeInTheDocument();
  expect(screen.getByText("Vectoriel")).toBeInTheDocument();
  expect(screen.getByText("© IGN")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/missions src/admin`
Expected: FAIL — `layers` / `kind` unknown, no "Ajouter une imagerie".

- [ ] **Step 3: Write minimal implementation**

- `geomap.ts`: `Mission.layers: string[]`, `MissionInput.layers?: string[]` (remove `basemapId`); `Basemap` gains `kind`, `attribution`, `bounds`.
- `fixtures.ts`: `mission()` default `layers: ["zone-nord"]`; `basemap()` default `kind: "VECTOR"`, `attribution: "© OpenStreetMap"`, `bounds: { minLon: 2, minLat: 48, maxLon: 3, maxLat: 49 }`.
- `MissionForm.tsx`: state `vector` (initial first layer if it is a vector basemap once basemaps load — simplest: initial `layers[0] ?? ""`) and `imagery` (initial `layers.slice(1)`); the "Fond de carte" select lists `kind === "VECTOR"` only; "Ajouter une imagerie" lists rasters not yet in `imagery` with a placeholder option, adding on change and resetting to the placeholder; imagery rows show name (from the basemap list, id as fallback), attribution and the three buttons (Monter disabled on the first row, Descendre on the last); submit `layers: [...(vector ? [vector] : []), ...imagery]`; reset after a successful create as today.
- `MissionEditorPage.tsx`: "Aucun fond de carte" status when the first layer is not a vector basemap (use the `["basemaps"]` query); pass `basemapId={vectorId}` to `MapView` (first layer when vector, else null) until Task 5.
- `PublicationPanel.tsx`: add `IMAGERY_OUT_OF_AREA: "Imagerie hors de la zone des objets"`.
- `BasemapsPage.tsx`: "Type" and "Attribution" columns.
- Update every test and fixture using `basemapId` (MissionsPage, MissionEditorPage, MapView tests…).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): choose a mission's imagery layers and show basemap types"
```

---

### Task 5: Web — imagery on the map and the Carte / Satellite / Hybride switch

**Files:**
- Create: `web/src/map/mapModes.ts`, `web/src/map/ModeSwitch.tsx`
- Modify: `web/src/map/style.ts`, `web/src/map/MapView.tsx`, `web/src/editor/MissionEditorPage.tsx`, `web/src/index.css`, and tests using the old `basemapStyle`/`MapView` props
- Test: `web/src/map/style.test.ts`, `web/src/map/mapModes.test.ts`, `web/src/map/ModeSwitch.test.tsx`

**Interfaces:**
- Consumes: `Basemap` with `kind` / `attribution` (Task 4).
- Produces:
  - `style.ts`: `IMAGERY_PREFIX = "imagery-"`; `interface StackLayer { id: string; name: string; attribution: string }`; `isOverlay(layer: LayerSpecification): boolean`; `basemapStyle(stack: { vector: StackLayer | null; imagery: StackLayer[] }): StyleSpecification` — sources `basemap` (vector, with its attribution) and `imagery-<id>` (`type: "raster"`, `url: "pmtiles://<absolute tiles url>"`, `tileSize: 256`, attribution); layers: Protomaps base layers, one `raster` layer per imagery (`id: "imagery-<id>"`, in list order), Protomaps overlay layers. Without a vector basemap: a `background` layer then the imagery.
  - `mapModes.ts`: `type MapMode = "Carte" | "Satellite" | "Hybride"`; `visibility(layerId, overlay, mode): "visible" | "none"`; `effectiveMode(mode, hasImagery)`; `loadMode()` / `saveMode(mode)` on `localStorage` key `geomap.mapMode`, try/catch, default `Carte`.
  - `ModeSwitch({ mode, hasImagery, onMode })` — three buttons with `aria-pressed`; Satellite and Hybride disabled without imagery.
  - `MapView({ vector: StackLayer | null; imagery: StackLayer[]; mode: MapMode; initialBounds?; onReady? })`.

- [ ] **Step 1: Write the failing tests**

`web/src/map/style.test.ts` — rewrite the existing tests for the new signature (`basemapStyle({ vector, imagery: [] })`; the "no basemap" case becomes `basemapStyle({ vector: null, imagery: [] })`), keep the "own origin" and "shipped fonts" assertions, and add:

```ts
import { basemapStyle, isOverlay } from "./style";

const vector = { id: "zone-nord", name: "Zone Nord", attribution: "© OpenStreetMap" };
const paris = { id: "paris-ortho", name: "Paris", attribution: "© IGN" };
const lyon = { id: "lyon-ortho", name: "Lyon", attribution: "© IGN" };

it("stacks base layers, imagery in order, then roads and labels", () => {
  const style = basemapStyle({ vector, imagery: [paris, lyon] });
  const ids = style.layers.map((l) => l.id);
  const first = ids.indexOf("imagery-paris-ortho");
  expect(ids.indexOf("imagery-lyon-ortho")).toBe(first + 1);
  expect(style.layers.slice(0, first).every((l) => !isOverlay(l))).toBe(true);
  expect(style.layers.slice(first + 2).every((l) => isOverlay(l))).toBe(true);
  expect(style.sources["imagery-paris-ortho"]).toMatchObject({
    type: "raster",
    url: `pmtiles://${location.origin}/api/basemaps/paris-ortho/pmtiles`,
    tileSize: 256,
    attribution: "© IGN",
  });
  expect(style.sources.basemap).toMatchObject({ attribution: "© OpenStreetMap" });
});

it("classifies roads, boundaries and every text as overlay", () => {
  const overlay = basemapStyle({ vector, imagery: [] }).layers.filter(isOverlay).map((l) => l.id);
  expect(overlay).toContain("roads_highway");
  expect(overlay).toContain("boundaries_country");
  expect(overlay).toContain("places_locality");
  expect(overlay).not.toContain("water");
  expect(overlay).not.toContain("earth");
});

it("still shows imagery without a vector basemap", () => {
  const style = basemapStyle({ vector: null, imagery: [paris] });
  expect(style.layers.map((l) => l.id)).toEqual(["background", "imagery-paris-ortho"]);
});
```

`web/src/map/mapModes.test.ts`:

```ts
import { effectiveMode, loadMode, saveMode, visibility } from "./mapModes";

it("shows the vector map alone in Carte", () => {
  expect(visibility("water", false, "Carte")).toBe("visible");
  expect(visibility("roads_major", true, "Carte")).toBe("visible");
  expect(visibility("imagery-paris", false, "Carte")).toBe("none");
});

it("shows imagery over the base in Satellite, without roads or labels", () => {
  expect(visibility("water", false, "Satellite")).toBe("visible");
  expect(visibility("imagery-paris", false, "Satellite")).toBe("visible");
  expect(visibility("places_locality", true, "Satellite")).toBe("none");
});

it("adds roads and labels over imagery in Hybride", () => {
  expect(visibility("imagery-paris", false, "Hybride")).toBe("visible");
  expect(visibility("places_locality", true, "Hybride")).toBe("visible");
});

it("falls back to Carte when the mission has no imagery", () => {
  expect(effectiveMode("Hybride", false)).toBe("Carte");
  expect(effectiveMode("Hybride", true)).toBe("Hybride");
});

it("remembers the mode per browser and survives a blocked storage", () => {
  saveMode("Satellite");
  expect(loadMode()).toBe("Satellite");
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(loadMode()).toBe("Carte");
  spy.mockRestore();
  localStorage.clear();
});
```

`web/src/map/ModeSwitch.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModeSwitch } from "./ModeSwitch";

it("marks the current mode and switches", async () => {
  const onMode = vi.fn();
  render(<ModeSwitch mode="Carte" hasImagery onMode={onMode} />);
  expect(screen.getByRole("button", { name: "Carte" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "Hybride" }));
  expect(onMode).toHaveBeenCalledWith("Hybride");
});

it("disables Satellite and Hybride without imagery", () => {
  render(<ModeSwitch mode="Carte" hasImagery={false} onMode={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Satellite" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Hybride" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Carte" })).toBeEnabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/map`
Expected: FAIL — new exports missing.

- [ ] **Step 3: Write minimal implementation**

`web/src/map/style.ts`:

```ts
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { basemapTilesUrl } from "../api/geomap";

export const BASEMAP_SOURCE = "basemap";
export const MAP_FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
export const IMAGERY_PREFIX = "imagery-";

export interface StackLayer {
  id: string;
  name: string;
  attribution: string;
}

export function absoluteTilesUrl(basemapId: string): string {
  return location.origin + basemapTilesUrl(basemapId);
}

// Roads, boundaries and every text sit above imagery in Hybride and disappear in Satellite.
export function isOverlay(layer: LayerSpecification): boolean {
  return layer.type === "symbol" || layer.id.startsWith("roads_") || layer.id.startsWith("boundaries");
}

export function basemapStyle(stack: {
  vector: StackLayer | null;
  imagery: StackLayer[];
}): StyleSpecification {
  const assets = `${location.origin}/map-assets`;
  const vectorLayers = stack.vector
    ? layers(BASEMAP_SOURCE, namedFlavor("light"), { lang: "fr" })
    : [];
  const base: LayerSpecification[] = stack.vector
    ? vectorLayers.filter((l) => !isOverlay(l))
    : [{ id: "background", type: "background", paint: { "background-color": "#e8e4d8" } }];
  const imageryLayers: LayerSpecification[] = stack.imagery.map((layer) => ({
    id: IMAGERY_PREFIX + layer.id,
    type: "raster",
    source: IMAGERY_PREFIX + layer.id,
  }));
  return {
    version: 8,
    glyphs: `${assets}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${assets}/sprites/v4/light`,
    sources: {
      ...(stack.vector
        ? {
            [BASEMAP_SOURCE]: {
              type: "vector" as const,
              url: `pmtiles://${absoluteTilesUrl(stack.vector.id)}`,
              attribution: stack.vector.attribution,
            },
          }
        : {}),
      ...Object.fromEntries(
        stack.imagery.map((layer) => [
          IMAGERY_PREFIX + layer.id,
          {
            type: "raster" as const,
            url: `pmtiles://${absoluteTilesUrl(layer.id)}`,
            tileSize: 256,
            attribution: layer.attribution,
          },
        ]),
      ),
    },
    layers: [...base, ...imageryLayers, ...vectorLayers.filter(isOverlay)],
  };
}
```

(Grouping base before overlay slightly changes Carte's draw order — e.g. tunnels now drawn above buildings. Accepted; mention it in the report if it looks wrong in the browser.)

`web/src/map/mapModes.ts`:

```ts
import { IMAGERY_PREFIX } from "./style";

export type MapMode = "Carte" | "Satellite" | "Hybride";

const KEY = "geomap.mapMode";
const MODES: MapMode[] = ["Carte", "Satellite", "Hybride"];

export function visibility(layerId: string, overlay: boolean, mode: MapMode): "visible" | "none" {
  if (layerId.startsWith(IMAGERY_PREFIX)) return mode === "Carte" ? "none" : "visible";
  if (overlay) return mode === "Satellite" ? "none" : "visible";
  return "visible";
}

export const effectiveMode = (mode: MapMode, hasImagery: boolean): MapMode =>
  hasImagery ? mode : "Carte";

// A per-browser convenience: storage may be blocked (private window), never an error.
export function loadMode(): MapMode {
  try {
    const stored = localStorage.getItem(KEY);
    return MODES.includes(stored as MapMode) ? (stored as MapMode) : "Carte";
  } catch {
    return "Carte";
  }
}

export function saveMode(mode: MapMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Not remembered, nothing else to do.
  }
}
```

`web/src/map/ModeSwitch.tsx`:

```tsx
import type { MapMode } from "./mapModes";

const MODES: MapMode[] = ["Carte", "Satellite", "Hybride"];

export function ModeSwitch({
  mode,
  hasImagery,
  onMode,
}: {
  mode: MapMode;
  hasImagery: boolean;
  onMode: (mode: MapMode) => void;
}) {
  return (
    <div className="mode-switch" role="group" aria-label="Vue">
      {MODES.map((m) => (
        <button
          key={m}
          aria-pressed={mode === m}
          disabled={m !== "Carte" && !hasImagery}
          onClick={() => onMode(m)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
```

`web/src/map/MapView.tsx` — props become `{ vector: StackLayer | null; imagery: StackLayer[]; mode: MapMode; initialBounds?; onReady? }`:
- build the style with `basemapStyle({ vector, imagery })` and keep the list of its layers (`style.layers`) in a ref;
- register one `new PMTiles(new FetchSource(absoluteTilesUrl(id), tileHeaders))` per stack layer with `protocol.add`, and remove each from `protocol.tiles` on cleanup (identity check, as today for the vector);
- keep the vector header handling (fit to its bounds, `Fond de carte illisible` alert); for each imagery, a failed `getHeader()` adds `Imagerie illisible : <name>` to a list of alerts (respect the `disposed` guard; render each as `role="alert"`);
- hold the created map in state; an effect on `[map, mode]` sets `map.setLayoutProperty(layer.id, "visibility", visibility(layer.id, isOverlay(layer), mode))` for every layer of the built style (never the mission or APP-6D layers), and the same is applied once on `load`;
- the map-creating effect depends on a key made of the vector id and imagery ids (`[vector?.id ?? "", ...imagery.map((i) => i.id)].join("|")`).

`web/src/editor/MissionEditorPage.tsx`:
- from the `["basemaps"]` query and `mission.layers`: `vector` = the first layer when its basemap is `VECTOR` (as `StackLayer`), `imagery` = the `RASTER` layers in order;
- `const [mode, setMode] = useState(loadMode)`; `const shown = effectiveMode(mode, imagery.length > 0)`;
- render `<ModeSwitch mode={shown} hasImagery={imagery.length > 0} onMode={(m) => { saveMode(m); setMode(m); }} />` over the map (top-right);
- key `MapView` by the joined layer ids (replaces `key={current.basemapId ?? "none"}`) and pass `vector`, `imagery`, `mode={shown}`.

`web/src/index.css` — append:

```css
.mode-switch {
  position: absolute;
  top: 0.5rem;
  right: 3rem;
  z-index: 2;
  display: flex;
  gap: 0.25rem;
}
.mode-switch [aria-pressed="true"] {
  font-weight: bold;
}
```

(Place the switch inside the positioned map frame so it overlays the map.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): show imagery with Carte, Satellite and Hybride views"
```

---

### Task 6: Imagery preparation tool

**Files:**
- Create: `tools/imagery/imagery/__init__.py`, `tools/imagery/imagery/tiles.py`, `tools/imagery/imagery/mbtiles.py`, `tools/imagery/imagery/sources.py`, `tools/imagery/imagery/cli.py`, `tools/imagery/imagery/__main__.py`, `tools/imagery/tests/__init__.py`, `tools/imagery/tests/test_tiles.py`, `tools/imagery/tests/test_cli.py`, `tools/imagery/README.md`
- Modify: `Makefile`

**Interfaces:**
- Produces: run from `tools/imagery`: `python3 -m imagery ign --bbox W,S,E,N --zooms 10-17 --name NAME --attribution TEXT --licence TEXT --out OUT.pmtiles [--max-tiles N] [--yes] [--pmtiles PATH]` and `python3 -m imagery gdal INPUT.tif --zooms 10-17 --name … --attribution … --licence … --out OUT.pmtiles [...]`. Prints the estimate (tile count, approximate MB at 20 kB/tile), asks for confirmation unless `--yes`, refuses above `--max-tiles` (default 50 000) and without `--attribution`. Modules: `tiles.tile_range(bbox, z)`, `tiles.count(bbox, zmin, zmax)`; `mbtiles.write(path, metadata, tiles)`; `sources.ign_tiles(bbox, zmin, zmax, fetch=…, workers=6, missing=None)`, `sources.gdal_mbtiles(source, out, zmax)`; `cli.main(argv, fetch=…, convert=…)` (both injectable for tests). `make check` runs the tool's unit tests.

- [ ] **Step 1: Write the failing tests**

`tools/imagery/tests/__init__.py`: empty.

`tools/imagery/tests/test_tiles.py`:

```python
import sqlite3
import tempfile
import unittest
from pathlib import Path

from imagery import mbtiles, tiles

PARIS = (2.20, 48.78, 2.47, 48.94)


class TileMathTest(unittest.TestCase):
    def test_single_tile_at_zoom_zero(self):
        self.assertEqual(tiles.tile_range(PARIS, 0), [(0, 0, 0)])

    def test_known_tile_contains_les_halles(self):
        self.assertIn((15, 16597, 11272), tiles.tile_range(PARIS, 15))

    def test_count_grows_about_four_times_per_zoom(self):
        low, high = tiles.count(PARIS, 14, 14), tiles.count(PARIS, 15, 15)
        self.assertGreater(high, 3 * low)
        self.assertEqual(tiles.count(PARIS, 14, 15), low + high)


class MbtilesTest(unittest.TestCase):
    def test_writes_tms_rows_and_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "t.mbtiles"
            mbtiles.write(path, {"name": "t", "format": "jpg", "attribution": "© IGN"}, [((1, 0, 0), b"jpeg")])
            db = sqlite3.connect(path)
            self.assertEqual(db.execute("SELECT tile_row FROM tiles").fetchone()[0], 1)
            self.assertEqual(dict(db.execute("SELECT name, value FROM metadata"))["attribution"], "© IGN")
            db.close()
```

`tools/imagery/tests/test_cli.py`:

```python
import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from imagery import cli

BASE = ["ign", "--bbox", "2.2,48.78,2.47,48.94", "--name", "Paris", "--licence", "Etalab 2.0", "--yes"]


class CliTest(unittest.TestCase):
    def run_cli(self, *args):
        out = io.StringIO()
        converted = []
        with redirect_stdout(out):
            code = cli.main(list(args), fetch=lambda z, x, y: b"jpeg", convert=lambda src, dst: converted.append(dst))
        return code, out.getvalue(), converted

    def test_refuses_without_attribution(self):
        code, out, converted = self.run_cli(*BASE, "--zooms", "10-11", "--out", "/tmp/x.pmtiles")
        self.assertNotEqual(code, 0)
        self.assertIn("attribution", out)
        self.assertEqual(converted, [])

    def test_refuses_above_the_tile_cap(self):
        code, out, converted = self.run_cli(*BASE, "--zooms", "10-17", "--attribution", "© IGN",
                                            "--out", "/tmp/x.pmtiles", "--max-tiles", "100")
        self.assertNotEqual(code, 0)
        self.assertIn("tuiles", out)
        self.assertEqual(converted, [])

    def test_estimates_then_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "paris.pmtiles"
            code, out, converted = self.run_cli(*BASE, "--zooms", "10-11", "--attribution", "© IGN", "--out", str(target))
        self.assertEqual(code, 0)
        self.assertIn("tuiles", out)
        self.assertEqual(converted, [target])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tools/imagery && python3 -m unittest discover -s tests -t .`
Expected: FAIL — `ModuleNotFoundError: No module named 'imagery'`.

- [ ] **Step 3: Write minimal implementation**

`tools/imagery/imagery/__init__.py`: empty.

`tools/imagery/imagery/tiles.py`:

```python
"""Web Mercator tile maths for a lon/lat bounding box."""

import math


def tile_range(bbox, z):
    west, south, east, north = bbox
    n = 2**z

    def xy(lon, lat):
        x = min(n - 1, int((lon + 180) / 360 * n))
        y = min(n - 1, int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))
        return x, y

    x0, y0 = xy(west, north)
    x1, y1 = xy(east, south)
    return [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def count(bbox, zmin, zmax):
    return sum(len(tile_range(bbox, z)) for z in range(zmin, zmax + 1))
```

`tools/imagery/imagery/mbtiles.py`:

```python
"""Minimal MBTiles writer; `pmtiles convert` turns it into a PMTiles archive."""

import sqlite3


def write(path, metadata, tiles):
    db = sqlite3.connect(path)
    db.executescript(
        "CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT);"
        "CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);"
        "CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row);"
    )
    db.executemany("INSERT INTO metadata VALUES (?, ?)", [(k, str(v)) for k, v in metadata.items()])
    written = 0
    for (z, x, y), data in tiles:
        # MBTiles rows count from the bottom (TMS).
        db.execute("INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?)", (z, x, (2**z - 1) - y, data))
        written += 1
        if written % 500 == 0:
            db.commit()
    db.commit()
    db.close()
    return written
```

`tools/imagery/imagery/sources.py`:

```python
"""Tile sources: the IGN Géoplateforme WMTS and local rasters through GDAL."""

import subprocess
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from . import tiles

IGN_URL = (
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0"
    "&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM"
    "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg"
)


def fetch_ign(z, x, y):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(IGN_URL.format(z=z, x=x, y=y), timeout=30) as response:
                return response.read()
        except OSError:
            time.sleep(2**attempt)
    return None


def ign_tiles(bbox, zmin, zmax, fetch=fetch_ign, workers=6, missing=None):
    """Yields ((z, x, y), bytes); tiles that never download are appended to `missing`."""
    wanted = [t for z in range(zmin, zmax + 1) for t in tiles.tile_range(bbox, z)]
    with ThreadPoolExecutor(workers) as pool:
        for tile, data in zip(wanted, pool.map(lambda t: fetch(*t), wanted)):
            if data is None:
                if missing is not None:
                    missing.append(tile)
                continue
            yield tile, data


def gdal_mbtiles(source, out, zmax):
    subprocess.run(["gdal_translate", "-of", "MBTILES", "-co", "TILE_FORMAT=JPEG", source, out], check=True)
    subprocess.run(["gdaladdo", "-r", "average", out, *[str(2**i) for i in range(1, zmax)]], check=True)
```

`tools/imagery/imagery/cli.py`:

```python
"""Prepare an imagery PMTiles archive for geoMap, on a connected preparation machine."""

import argparse
import subprocess
import tempfile
from pathlib import Path

from . import mbtiles, sources, tiles

TILE_KB = 20


def pmtiles_convert(pmtiles_bin):
    return lambda src, dst: subprocess.run([pmtiles_bin, "convert", str(src), str(dst)], check=True)


def main(argv=None, fetch=sources.fetch_ign, convert=None):
    parser = argparse.ArgumentParser(prog="imagery")
    parser.add_argument("source", choices=["ign", "gdal"])
    parser.add_argument("input", nargs="?", help="GeoTIFF/JP2 file for the gdal source")
    parser.add_argument("--bbox", help="west,south,east,north (ign source)")
    parser.add_argument("--zooms", required=True, help="min-max, e.g. 10-17")
    parser.add_argument("--name", required=True)
    parser.add_argument("--attribution")
    parser.add_argument("--licence", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--max-tiles", type=int, default=50_000)
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--pmtiles", default="pmtiles")
    args = parser.parse_args(argv)

    if not args.attribution:
        print("--attribution est obligatoire : la carte doit citer la source de l'imagerie.")
        return 2
    zmin, zmax = (int(z) for z in args.zooms.split("-"))
    convert = convert or pmtiles_convert(args.pmtiles)
    metadata = {
        "name": args.name,
        "format": "jpg",
        "type": "baselayer",
        "minzoom": zmin,
        "maxzoom": zmax,
        "attribution": args.attribution,
        "licence": args.licence,
    }

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "imagery.mbtiles"
        if args.source == "ign":
            bbox = tuple(float(v) for v in args.bbox.split(","))
            total = tiles.count(bbox, zmin, zmax)
            print(f"{total} tuiles, environ {total * TILE_KB // 1024} Mo")
            if total > args.max_tiles:
                print(f"Plus de {args.max_tiles} tuiles : réduisez la zone ou les zooms, ou relevez --max-tiles.")
                return 2
            if not args.yes and input("Continuer ? [o/N] ").strip().lower() != "o":
                return 1
            metadata["bounds"] = args.bbox
            missing = []
            mbtiles.write(work, metadata, sources.ign_tiles(bbox, zmin, zmax, fetch=fetch, missing=missing))
            if missing:
                print(f"{len(missing)} tuiles manquantes")
        else:
            sources.gdal_mbtiles(args.input, str(work), zmax)
            mbtiles.write(work, metadata, [])
        convert(work, Path(args.out))
    print(f"Écrit : {args.out}")
    return 0
```

`tools/imagery/imagery/__main__.py`:

```python
import sys

from .cli import main

sys.exit(main())
```

`tools/imagery/README.md` — one page in French: purpose (prepare imagery outside the air-gapped network, then import it through « Fonds de carte »), prerequisites (Python 3, `pmtiles` CLI 1.31.2, GDAL for local files), the two commands with a Paris example, allowed sources (IGN BD ORTHO under Licence Ouverte Etalab 2.0; imagery supplied by ALIAS) and the reminder that Esri, Google and Bing imagery may not be used offline.

Root `Makefile` — add to `check`, before the web line (recipe line starts with a tab):

```make
	cd tools/imagery && python3 -m unittest discover -s tests -t .
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tools/imagery && python3 -m unittest discover -s tests -t .`
Expected: OK (7 tests).

- [ ] **Step 5: Run the gate and commit**

Run: `make check`
Expected: all green.

```bash
git add tools Makefile
git commit -m "feat(tools): prepare imagery PMTiles from IGN or local rasters"
```

---

### Task 7: End-to-end imagery journey on real archives

**Files:**
- Create: `web/e2e/fixtures/vector.pmtiles`, `web/e2e/fixtures/imagery.pmtiles`, `web/e2e/fixtures/SOURCE.md`, `web/e2e/imagery.spec.ts`
- Modify: `web/e2e/journey.spec.ts` (its basemap uploads must use the vector fixture: random bytes are now refused)

**Interfaces:**
- Consumes: everything above; `make e2e` (production bundle, page-error guard, `test`/`expect` from `web/e2e/fixtures.ts`).
- Produces: committed fixtures — a vector archive extracted from the Protomaps daily build over a small area, and an imagery archive made with the tool over the same area; each under 2 MB; `SOURCE.md` records the commands, the date and the licences (ODbL for OpenStreetMap data, Licence Ouverte Etalab 2.0 for IGN).

- [ ] **Step 1: Create the fixtures**

```bash
PMTILES=$(command -v pmtiles)   # or the path of a downloaded go-pmtiles 1.31.2 binary
$PMTILES extract https://build.protomaps.com/$(date -u -d yesterday +%Y%m%d).pmtiles \
  web/e2e/fixtures/vector.pmtiles --bbox=2.33,48.85,2.36,48.87 --maxzoom=14
(cd tools/imagery && python3 -m imagery ign --bbox 2.33,48.85,2.36,48.87 --zooms 12-15 \
  --name "IGN test" --attribution "© IGN BD ORTHO" --licence "Licence Ouverte Etalab 2.0" \
  --out ../../web/e2e/fixtures/imagery.pmtiles --yes --pmtiles "$PMTILES")
stat -c '%s %n' web/e2e/fixtures/*.pmtiles
```

Expected: both files exist and are under 2 MB each. Write `SOURCE.md` with the exact commands, the build date used and the licences.

- [ ] **Step 2: Write the journey**

In `web/e2e/journey.spec.ts`, make `uploadBasemap` upload `readFileSync("e2e/fixtures/vector.pmtiles")` instead of random bytes (both zones use it under their own ids).

`web/e2e/imagery.spec.ts`:

```ts
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

test("a planner stacks imagery and switches between Carte, Satellite and Hybride", async ({
  page,
}) => {
  const suffix = randomBytes(3).toString("hex");
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Fonds de carte" }).click();
  for (const [id, file] of [
    [`base-${suffix}`, "e2e/fixtures/vector.pmtiles"],
    [`ortho-${suffix}`, "e2e/fixtures/imagery.pmtiles"],
  ]) {
    await page.getByLabel("Identifiant").fill(id);
    await page.getByLabel("Nom").fill(id);
    await page.getByLabel("Fichier PMTiles").setInputFiles({
      name: `${id}.pmtiles`,
      mimeType: "application/octet-stream",
      buffer: readFileSync(file),
    });
    await page.getByRole("button", { name: "Importer" }).click();
    await expect(page.getByRole("status")).toContainText(id);
  }
  await expect(page.getByRole("row", { name: new RegExp(`ortho-${suffix}.*Imagerie`) })).toBeVisible();

  await page.getByRole("button", { name: "Déconnexion" }).click();
  await signIn(page, "planner");
  await page.getByLabel("Nom").fill(`Op Ortho ${suffix}`);
  await page.getByLabel("Fond de carte").selectOption({ label: `base-${suffix}` });
  await page.getByLabel("Ajouter une imagerie").selectOption({ label: `ortho-${suffix}` });
  await page.getByRole("button", { name: "Créer la mission" }).click();
  await page.getByRole("link", { name: `Op Ortho ${suffix}` }).click();

  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  for (const mode of ["Satellite", "Hybride", "Carte"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.getByRole("button", { name: mode, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("IGN");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
```

(Adapt selectors to the real UI — sign-out flow, admin row text, attribution control class — never the intent: imagery imported as "Imagerie", added to a mission, all three modes selectable with no page error or alert, and the IGN attribution shown.)

- [ ] **Step 3: Run the journey**

Run: `make e2e`
Expected: all specs PASS (smoke, journey, imagery); no containers left.

- [ ] **Step 4: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`, then `make check` at the repo root.
Expected: all green.

```bash
git add web
git commit -m "test(web): end-to-end imagery journey on real PMTiles archives"
```
