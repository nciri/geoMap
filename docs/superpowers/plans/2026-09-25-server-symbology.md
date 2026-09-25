# Server Symbology Implementation Plan (plan 2b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the server an APP-6D symbology engine: a searchable symbol catalogue, icon and tactical-graphic rendering (mil-sym-java), strict validation of APP-6D objects, and a mission validator that tells the planner whether a mission can be published.

**Architecture:** A `geomap.server.symbology` package wraps mil-sym-java behind two Spring components: `SymbolCatalog` (metadata lookup, search, placement rules) and `SymbolRenderer` (PNG icons for point symbols, GeoJSON for multipoint graphics, per zoom band). `FeatureService` delegates APP-6D checks to the catalogue. New endpoints serve the catalogue, icons and graphic previews to the web editor; `MissionValidator` reports blocking errors and warnings per mission. All rendering stays on the server (spec §2).

**Tech Stack:** Kotlin 2.2.20, Spring Boot 4.1.0, mil-sym-java 2.9.6 (`io.github.missioncommand:mil-sym-java`, Apache-2.0, depends on geodesy 1.1.3 and jsvg 2.0.0), Jackson 3, JUnit 5, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` (sections 2, 5, 6.2, 8.1, 9, 14)

**Plan series:** 2a (done, branch `feature/server`) → **2b (this plan, same branch)** → 2c (publication and packages) → 2d (enrollment, PKI adapter).

## Verified facts about mil-sym-java 2.9.6 (spike, 2026-09-25)

- `MSLookup.getInstance().getMSLInfo(sidc)` returns `MSInfo` (or `null` for an unknown symbol) with `name`, `path` (category, e.g. `"Land Unit / Movement and Maneuver / "`), `geometry` (`"point"`, `"Point"`, `"Line"`, `"Area"` or `""`), `minPointCount`, `maxPointCount`, `basicSymbolID` (8 digits: symbol set + entity), `modifiers` (keys such as `"T_UNIQUE_DESIGNATION_1"`).
- `MSLookup.getIDList(SymbolID.Version_APP6D)` lists 1869 APP-6D basic ids; `getMSLInfo(basicId, SymbolID.Version_APP6D)` describes each. `SymbolID.Version_APP6D == 10`.
- `Modifiers.getModifierKey("T") == "T_UNIQUE_DESIGNATION_1"` (returns `null` for an unknown letter code); `Modifiers.getModifierLetterCode("N_HOSTILE") == "N"`.
- `MilStdIconRenderer.getInstance().CanRender(sidc, HashMap(modifiers))` is `false` for unknown SIDCs; `RenderIcon(sidc, modifiers, mapOf(MilStdAttributes.PixelSize to "64"))` returns an `ImageInfo` (`imageAsByteArray` is a PNG, `symbolCenterX/Y` the anchor).
- `WebRenderer.RenderSymbol(id, name, description, sidc, "lon,lat lon,lat …", "clampToGround", scale, "minLon,minLat,maxLon,maxLat", modifiers, attributes, WebRenderer.OUTPUT_FORMAT_GEOJSON)` returns a GeoJSON `FeatureCollection`: `MultiLineString` strokes, `Point` labels (`label`, `angle`, font properties), plus one metadata feature (empty `Polygon`, properties contain `symbolID`) to strip. On failure it returns `{"type":"error","error":"…"}`. Output depends on `scale` (1:50 000 → 14.7 kB, 1:500 000 → 9 kB for the same line).
- Reference SIDCs used in tests: `10031000001211000000` Infantry (point), `10032500001401000000` Forward Line of Troops (line, 2..∞ points), `10032500001512000000` Battle Position (area, 3..∞ points), `10032500001417000000` Ambush (line, exactly 3 points).
- Licence: the repository `LICENSE`, the published `pom.xml` and the GitHub API say **Apache-2.0**; the jar's `MANIFEST.MF` still says "GNU General Public License v3.0" (stale build metadata). Recorded in the spec for legal confirmation.

## Global Constraints

- Everything from plan 2a's Global Constraints still applies (Spring Boot 4.1.0, Kotlin 2.2.20, JVM 17, ProblemDetail errors, agents only suggest, audit without content, `make check` gate, Conventional Commits without AI attribution).
- Dependency: `io.github.missioncommand:mil-sym-java:2.9.6` only; no other new runtime dependency.
- APP-6D only: a SIDC is 20 digits starting with version `10`.
- Modifiers in the API are APP-6 letter codes (`T`, `B`, `W`, …), translated to mil-sym keys only inside `SymbolRenderer`.
- Rendering runs on the server only, headless (`java.awt.headless=true`). Zoom bands and their render scales: `LOW` z0–10 at 1:2 000 000, `MID` z11–14 at 1:150 000, `HIGH` z15–22 at 1:10 000.
- Placement rules come from the catalogue: `point` → GeoJSON `Point`, `Line` → `LineString`, `Area` → `Polygon`; control-point count within `[minPointCount, maxPointCount]` (a polygon's closing position is not a control point); symbols with an empty geometry cannot be placed.

## Review Focus

- An unknown SIDC or a 2525 (non-APP-6D) SIDC must give 400 on feature creation, icon and preview — never 500. (Tasks 3, 4.)
- A symbol drawn with the wrong geometry type, a point count outside its bounds, or a modifier that does not apply must give 400 and store nothing. (Task 3.)
- Concurrent render requests must all succeed (mil-sym keeps static state). (Task 2.)
- A stored object that no longer renders (bypassing the API) must appear as a validation error, not crash validation. (Task 5.)
- The icon endpoint must reject unknown query parameters instead of silently ignoring them. (Task 4.)

## File Structure

| File | Responsibility |
|---|---|
| `server/build.gradle.kts` | adds mil-sym-java, headless tests |
| `server/src/main/kotlin/geomap/server/symbology/SymbolCatalog.kt` | APP-6D metadata, search, placement validation |
| `server/src/main/kotlin/geomap/server/symbology/SymbolRenderer.kt` | icons (PNG) and graphics (GeoJSON) per zoom band |
| `server/src/main/kotlin/geomap/server/symbology/SymbolController.kt` | `/api/symbols` search, icon, graphic preview |
| `server/src/main/kotlin/geomap/server/mission/GeoJsonGeometry.kt` | adds `controlPoints` |
| `server/src/main/kotlin/geomap/server/mission/FeatureService.kt` | APP-6D checks via the catalogue |
| `server/src/main/kotlin/geomap/server/mission/MissionValidator.kt` | validation report + `/api/missions/{id}/validation` |
| `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` | §14 licence row |
| tests under `server/src/test/kotlin/geomap/server/symbology/` and `.../mission/` | one test file per unit |

---

### Task 1: Symbol catalogue

**Files:**
- Modify: `server/build.gradle.kts`, `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` (§14)
- Create: `server/src/main/kotlin/geomap/server/symbology/SymbolCatalog.kt`
- Test: `server/src/test/kotlin/geomap/server/symbology/SymbolCatalogTest.kt`

**Interfaces:**
- Produces: `enum class SymbolGeometry { POINT, LINE, AREA }`; `data class SymbolInfo(basicId: String, name: String, path: String, geometry: SymbolGeometry, minPoints: Int, maxPoints: Int, modifiers: Set<String>)` (modifiers are letter codes); `@Component class SymbolCatalog` with `describe(sidc: String): SymbolInfo?` (null if not a known APP-6D SIDC or not placeable) and `search(query: String, limit: Int): List<SymbolInfo>` (every word of the query must appear in `path + name`, case-insensitive; empty query lists all); `SymbolCatalog.APP6D_SIDC: Regex`.

- [ ] **Step 1: Add the dependency and headless tests**

In `server/build.gradle.kts`, add to `dependencies`:

```kotlin
    implementation("io.github.missioncommand:mil-sym-java:2.9.6")
```

and replace the `tasks.test` block with:

```kotlin
tasks.test {
    useJUnitPlatform()
    // mil-sym renders with java.awt; CI machines have no display.
    systemProperty("java.awt.headless", "true")
}
```

- [ ] **Step 2: Write the failing test**

`server/src/test/kotlin/geomap/server/symbology/SymbolCatalogTest.kt`:

```kotlin
package geomap.server.symbology

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SymbolCatalogTest {
    private val catalog = SymbolCatalog()

    @Test
    fun `describes a point unit`() {
        val infantry = catalog.describe("10031000001211000000")!!
        assertEquals("Infantry", infantry.name)
        assertEquals(SymbolGeometry.POINT, infantry.geometry)
        assertEquals("10121100", infantry.basicId)
        assertTrue("T" in infantry.modifiers)
    }

    @Test
    fun `describes a line and an area graphic`() {
        val flot = catalog.describe("10032500001401000000")!!
        assertEquals(SymbolGeometry.LINE, flot.geometry)
        assertEquals(2, flot.minPoints)
        val battlePosition = catalog.describe("10032500001512000000")!!
        assertEquals(SymbolGeometry.AREA, battlePosition.geometry)
        assertEquals(3, battlePosition.minPoints)
    }

    @Test
    fun `does not describe unknown, malformed or non APP-6D codes`() {
        assertNull(catalog.describe("99999999999999999999"))
        assertNull(catalog.describe("1003100000121100000"))
        assertNull(catalog.describe("11031000001211000000"))
    }

    @Test
    fun `searches by words in category and name`() {
        assertTrue(catalog.search("infantry", 50).any { it.basicId == "10121100" })
        assertTrue(catalog.search("FORWARD line", 50).any { it.basicId == "25140100" })
    }

    @Test
    fun `limits search results`() {
        assertEquals(5, catalog.search("", 5).size)
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.symbology.SymbolCatalogTest`
Expected: FAIL, compilation error `Unresolved reference 'SymbolCatalog'`.

- [ ] **Step 4: Write the implementation**

`server/src/main/kotlin/geomap/server/symbology/SymbolCatalog.kt`:

```kotlin
package geomap.server.symbology

import armyc2.c5isr.renderer.utilities.MSInfo
import armyc2.c5isr.renderer.utilities.MSLookup
import armyc2.c5isr.renderer.utilities.Modifiers
import armyc2.c5isr.renderer.utilities.SymbolID
import org.springframework.stereotype.Component

enum class SymbolGeometry { POINT, LINE, AREA }

data class SymbolInfo(
    val basicId: String,
    val name: String,
    val path: String,
    val geometry: SymbolGeometry,
    val minPoints: Int,
    val maxPoints: Int,
    val modifiers: Set<String>,
)

@Component
class SymbolCatalog {
    private val lookup = MSLookup.getInstance()

    private val entries: List<SymbolInfo> by lazy {
        lookup.getIDList(SymbolID.Version_APP6D).mapNotNull { lookup.getMSLInfo(it, SymbolID.Version_APP6D)?.toSymbolInfo() }
    }

    fun describe(sidc: String): SymbolInfo? {
        if (!APP6D_SIDC.matches(sidc)) return null
        return lookup.getMSLInfo(sidc)?.toSymbolInfo()
    }

    fun search(
        query: String,
        limit: Int,
    ): List<SymbolInfo> {
        val words = query.lowercase().split(' ').filter { it.isNotBlank() }
        return entries
            .asSequence()
            .filter { entry -> "${entry.path} ${entry.name}".lowercase().let { text -> words.all { it in text } } }
            .take(limit)
            .toList()
    }

    private fun MSInfo.toSymbolInfo(): SymbolInfo? {
        val kind =
            when (geometry.lowercase()) {
                "point" -> SymbolGeometry.POINT
                "line" -> SymbolGeometry.LINE
                "area" -> SymbolGeometry.AREA
                else -> return null
            }
        return SymbolInfo(
            basicId = basicSymbolID,
            name = name,
            path = path.trim().trimEnd('/').trim(),
            geometry = kind,
            minPoints = minPointCount,
            maxPoints = maxPointCount,
            modifiers = modifiers.mapNotNull { Modifiers.getModifierLetterCode(it) }.toSet(),
        )
    }

    companion object {
        val APP6D_SIDC = Regex("^10\\d{18}$")
    }
}
```

- [ ] **Step 5: Record the licence finding in the spec**

In `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` §14, replace the row starting `| Licences de mil-sym-java et de ses dépendances |` with:

```markdown
| Licences de mil-sym-java et de ses dépendances | mil-sym-java 2.9.6 : Apache-2.0 (fichier `LICENSE`, `pom.xml`, API GitHub), mais le `MANIFEST.MF` du jar indique encore « GPL v3.0 » — incohérence à faire confirmer par le juridique. Dépendances : geodesy 1.1.3, jsvg 2.0.0 ; SVG ESRI en Apache-2.0. |
```

- [ ] **Step 6: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`, `SymbolCatalogTest` (5 tests) passes.

- [ ] **Step 7: Commit**

```bash
git add server docs/superpowers/specs
git commit -m "feat(server): add APP-6D symbol catalogue backed by mil-sym-java"
```

---

### Task 2: Symbol renderer

**Files:**
- Modify: `server/src/main/kotlin/geomap/server/mission/GeoJsonGeometry.kt` (add `controlPoints`), `server/src/test/kotlin/geomap/server/mission/GeoJsonGeometryTest.kt`
- Create: `server/src/main/kotlin/geomap/server/symbology/SymbolRenderer.kt`
- Test: `server/src/test/kotlin/geomap/server/symbology/SymbolRendererTest.kt`

**Interfaces:**
- Consumes: `InvalidInputException` (plan 2a).
- Produces:
  - `GeoJsonGeometry.controlPoints(geometry: Map<String, Any?>): List<Pair<Double, Double>>` (lon/lat; `Point` → 1, `LineString` → all, `Polygon` → outer ring without its closing position; throws `InvalidInputException` on malformed input)
  - `enum class RenderBand(val scale: Double) { LOW(2_000_000.0), MID(150_000.0), HIGH(10_000.0) }` with `RenderBand.forZoom(zoom: Int): RenderBand` (throws `InvalidInputException` outside 0..22)
  - `class RenderedIcon(val png: ByteArray, val width: Int, val height: Int, val anchorX: Int, val anchorY: Int)`
  - `@Component class SymbolRenderer(json: ObjectMapper)` with `icon(sidc: String, modifiers: Map<String, String>, pixelSize: Int): RenderedIcon` and `graphic(sidc: String, controlPoints: List<Pair<Double, Double>>, modifiers: Map<String, String>, band: RenderBand): Map<String, Any?>` (a GeoJSON `FeatureCollection` without the metadata feature). Both throw `InvalidInputException` for an unknown symbol or modifier letter.

- [ ] **Step 1: Write the failing tests**

Append to `server/src/test/kotlin/geomap/server/mission/GeoJsonGeometryTest.kt`, inside the class:

```kotlin
    @Test
    fun `control points drop the closing position of a polygon`() {
        assertEquals(4, GeoJsonGeometry.controlPoints(geometry("Polygon", listOf(square))).size)
        assertEquals(listOf(2.35 to 48.85), GeoJsonGeometry.controlPoints(geometry("Point", listOf(2.35, 48.85))))
        assertEquals(2, GeoJsonGeometry.controlPoints(geometry("LineString", listOf(listOf(2.0, 48.0), listOf(3, 49)))).size)
    }
```

`server/src/test/kotlin/geomap/server/symbology/SymbolRendererTest.kt`:

```kotlin
package geomap.server.symbology

import geomap.server.web.InvalidInputException
import tools.jackson.databind.json.JsonMapper
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class SymbolRendererTest {
    private val renderer = SymbolRenderer(JsonMapper.builder().build())
    private val line = listOf(2.0 to 48.0, 2.5 to 48.2, 3.0 to 48.1)
    private val area = listOf(2.0 to 48.0, 3.0 to 48.0, 3.0 to 49.0, 2.0 to 49.0)

    @Suppress("UNCHECKED_CAST")
    private fun features(collection: Map<String, Any?>) = collection["features"] as List<Map<String, Any?>>

    @Suppress("UNCHECKED_CAST")
    private fun Map<String, Any?>.properties() = this["properties"] as Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun Map<String, Any?>.geometryType() = (this["geometry"] as Map<String, Any?>)["type"]

    @Test
    fun `renders a point symbol as a PNG with its anchor`() {
        val icon = renderer.icon("10031000001211000000", mapOf("T" to "1ER RI"), 64)
        assertContentEquals(byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte()), icon.png.copyOf(4))
        assertTrue(icon.width > 0 && icon.height > 0)
        assertTrue(icon.anchorX in 0..icon.width && icon.anchorY in 0..icon.height)
    }

    @Test
    fun `refuses an unknown symbol or modifier`() {
        assertFailsWith<InvalidInputException> { renderer.icon("99999999999999999999", emptyMap(), 64) }
        assertFailsWith<InvalidInputException> { renderer.icon("10031000001211000000", mapOf("ZZ" to "x"), 64) }
        assertFailsWith<InvalidInputException> { renderer.graphic("10032500009999990000", line, emptyMap(), RenderBand.MID) }
    }

    @Test
    fun `renders a line graphic as GeoJSON without the metadata feature`() {
        val rendered = features(renderer.graphic("10032500001401000000", line, emptyMap(), RenderBand.MID))
        assertTrue(rendered.any { it.geometryType() == "MultiLineString" })
        assertTrue(rendered.none { "symbolID" in it.properties() })
    }

    @Test
    fun `renders modifiers as labels`() {
        val rendered = features(renderer.graphic("10032500001512000000", area, mapOf("T" to "BP1"), RenderBand.MID))
        assertTrue(rendered.any { it.properties()["label"] == "BP1" })
    }

    @Test
    fun `the rendering depends on the zoom band`() {
        val low = renderer.graphic("10032500001401000000", line, emptyMap(), RenderBand.LOW)
        val high = renderer.graphic("10032500001401000000", line, emptyMap(), RenderBand.HIGH)
        assertNotEquals(low, high)
    }

    @Test
    fun `maps zoom levels to bands`() {
        assertEquals(RenderBand.LOW, RenderBand.forZoom(10))
        assertEquals(RenderBand.MID, RenderBand.forZoom(11))
        assertEquals(RenderBand.HIGH, RenderBand.forZoom(22))
        assertFailsWith<InvalidInputException> { RenderBand.forZoom(23) }
    }

    @Test
    fun `concurrent renders all succeed`() {
        val pool = Executors.newFixedThreadPool(8)
        try {
            val jobs =
                (1..32).map {
                    Callable { features(renderer.graphic("10032500001401000000", line, emptyMap(), RenderBand.MID)).size }
                }
            assertTrue(pool.invokeAll(jobs).all { it.get() > 0 })
        } finally {
            pool.shutdown()
        }
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && ./gradlew test --tests geomap.server.symbology.SymbolRendererTest --tests geomap.server.mission.GeoJsonGeometryTest`
Expected: FAIL, compilation errors `Unresolved reference 'SymbolRenderer'` and `Unresolved reference 'controlPoints'`.

- [ ] **Step 3: Write the implementation**

In `server/src/main/kotlin/geomap/server/mission/GeoJsonGeometry.kt`, add inside `object GeoJsonGeometry`, after `validate`:

```kotlin
    fun controlPoints(geometry: Map<String, Any?>): List<Pair<Double, Double>> {
        val coordinates = geometry["coordinates"]
        return when (geometry["type"]) {
            "Point" -> listOf(position(coordinates))
            "LineString" -> positions(coordinates, minSize = 2)
            "Polygon" -> {
                val rings = coordinates as? List<*> ?: invalid("coordinates must be an array")
                positions(rings.firstOrNull(), minSize = 4).dropLast(1)
            }
            else -> invalid("unsupported geometry type: ${geometry["type"]}")
        }
    }
```

`server/src/main/kotlin/geomap/server/symbology/SymbolRenderer.kt`:

```kotlin
package geomap.server.symbology

import armyc2.c5isr.renderer.MilStdIconRenderer
import armyc2.c5isr.renderer.utilities.MilStdAttributes
import armyc2.c5isr.renderer.utilities.Modifiers
import armyc2.c5isr.web.render.WebRenderer
import geomap.server.web.InvalidInputException
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

enum class RenderBand(
    val scale: Double,
) {
    LOW(2_000_000.0),
    MID(150_000.0),
    HIGH(10_000.0),
    ;

    companion object {
        fun forZoom(zoom: Int): RenderBand =
            when (zoom) {
                in 0..10 -> LOW
                in 11..14 -> MID
                in 15..22 -> HIGH
                else -> throw InvalidInputException("zoom must be between 0 and 22")
            }
    }
}

class RenderedIcon(
    val png: ByteArray,
    val width: Int,
    val height: Int,
    val anchorX: Int,
    val anchorY: Int,
)

@Component
class SymbolRenderer(
    private val json: ObjectMapper,
) {
    // ponytail: mil-sym keeps static renderer state, so one global lock; use a pool of isolated renderers if throughput matters.
    private val lock = Any()

    fun icon(
        sidc: String,
        modifiers: Map<String, String>,
        pixelSize: Int,
    ): RenderedIcon {
        val keys = milSymModifiers(modifiers)
        val info =
            synchronized(lock) {
                val renderer = MilStdIconRenderer.getInstance()
                if (!renderer.CanRender(sidc, HashMap(keys))) throw InvalidInputException("cannot render symbol $sidc")
                renderer.RenderIcon(sidc, keys, mapOf(MilStdAttributes.PixelSize to "$pixelSize"))
            } ?: throw InvalidInputException("cannot render symbol $sidc")
        return RenderedIcon(info.imageAsByteArray, info.image.width, info.image.height, info.symbolCenterX, info.symbolCenterY)
    }

    @Suppress("UNCHECKED_CAST")
    fun graphic(
        sidc: String,
        controlPoints: List<Pair<Double, Double>>,
        modifiers: Map<String, String>,
        band: RenderBand,
    ): Map<String, Any?> {
        val keys = milSymModifiers(modifiers)
        val points = controlPoints.joinToString(" ") { (lon, lat) -> "$lon,$lat" }
        val output =
            synchronized(lock) {
                WebRenderer.RenderSymbol(
                    "geomap",
                    "",
                    "",
                    sidc,
                    points,
                    "clampToGround",
                    band.scale,
                    clipBox(controlPoints),
                    HashMap(keys),
                    HashMap(),
                    WebRenderer.OUTPUT_FORMAT_GEOJSON,
                )
            }
        val collection = json.readValue(output, Map::class.java) as Map<String, Any?>
        if (collection["type"] == "error") throw InvalidInputException("cannot render symbol $sidc")
        // mil-sym appends a feature carrying only metadata (empty polygon, symbolID…): not something to draw.
        val drawable =
            (collection["features"] as List<Map<String, Any?>>).filterNot {
                "symbolID" in (it["properties"] as Map<String, Any?>)
            }
        return mapOf("type" to "FeatureCollection", "features" to drawable)
    }

    private fun milSymModifiers(modifiers: Map<String, String>): Map<String, String> =
        modifiers.entries.associate { (letter, value) ->
            (Modifiers.getModifierKey(letter) ?: throw InvalidInputException("unknown modifier: $letter")) to value
        }

    // The clip box must contain the whole graphic: pad the control points' extent generously.
    private fun clipBox(points: List<Pair<Double, Double>>): String {
        val minLon = points.minOf { it.first }
        val maxLon = points.maxOf { it.first }
        val minLat = points.minOf { it.second }
        val maxLat = points.maxOf { it.second }
        val pad = maxOf(maxLon - minLon, maxLat - minLat, 0.01)
        return "${(minLon - pad).coerceAtLeast(-180.0)},${(minLat - pad).coerceAtLeast(-90.0)}," +
            "${(maxLon + pad).coerceAtMost(180.0)},${(maxLat + pad).coerceAtMost(90.0)}"
    }
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `SymbolRendererTest` (7 tests) and the new `GeoJsonGeometryTest` case pass.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): render APP-6D icons and tactical graphics per zoom band"
```

---

### Task 3: Placement validation for APP-6D objects

**Files:**
- Modify: `server/src/main/kotlin/geomap/server/symbology/SymbolCatalog.kt` (add `validate`), `server/src/main/kotlin/geomap/server/mission/FeatureService.kt`
- Test: `server/src/test/kotlin/geomap/server/symbology/SymbolCatalogTest.kt`, `server/src/test/kotlin/geomap/server/mission/FeatureApiTest.kt`

**Interfaces:**
- Consumes: `GeoJsonGeometry.controlPoints` (Task 2), `SymbolCatalog.describe` (Task 1).
- Produces: `SymbolCatalog.validate(sidc: String?, geometry: Map<String, Any?>, modifiers: Map<String, String>?): SymbolInfo` — throws `InvalidInputException` when the SIDC is missing or unknown, the geometry type does not match (`POINT`→`Point`, `LINE`→`LineString`, `AREA`→`Polygon`), the control-point count is outside `[minPoints, maxPoints]`, or a modifier letter does not apply to the symbol. Callers validate the GeoJSON first (`GeoJsonGeometry.validate`). `FeatureService` uses it for `APP6` objects, replacing the 20-digit regex.

Messages: `"an APP-6D symbol needs a SIDC"`, `"unknown APP-6D symbol: <sidc>"`, `"<name> must be drawn as a <Point|LineString|Polygon>"`, `"<name> needs <min> to <max> points"`, `"modifier <letter> does not apply to <name>"`.

- [ ] **Step 1: Write the failing tests**

In `SymbolCatalogTest`, add the imports `geomap.server.web.InvalidInputException` and `kotlin.test.assertFailsWith`, then append inside the class:

```kotlin
    private fun point() = mapOf("type" to "Point", "coordinates" to listOf(2.35, 48.85))

    private fun line(vararg lons: Double) = mapOf("type" to "LineString", "coordinates" to lons.map { listOf(it, 48.0) })

    @Test
    fun `accepts a symbol drawn with its geometry`() {
        assertEquals("Infantry", catalog.validate("10031000001211000000", point(), mapOf("T" to "1ER RI")).name)
        assertEquals(SymbolGeometry.LINE, catalog.validate("10032500001401000000", line(2.0, 3.0), null).geometry)
        assertEquals("Ambush", catalog.validate("10032500001417000000", line(2.0, 2.5, 3.0), null).name)
    }

    @Test
    fun `rejects a missing or unknown SIDC`() {
        assertFailsWith<InvalidInputException> { catalog.validate(null, point(), null) }
        assertFailsWith<InvalidInputException> { catalog.validate("11031000001211000000", point(), null) }
    }

    @Test
    fun `rejects the wrong geometry type`() {
        val error = assertFailsWith<InvalidInputException> { catalog.validate("10032500001401000000", point(), null) }
        assertEquals("Forward Line of Troops must be drawn as a LineString", error.message)
    }

    @Test
    fun `rejects a point count outside the symbol bounds`() {
        val tooFew = assertFailsWith<InvalidInputException> { catalog.validate("10032500001417000000", line(2.0, 3.0), null) }
        assertEquals("Ambush needs 3 to 3 points", tooFew.message)
        assertFailsWith<InvalidInputException> { catalog.validate("10032500001417000000", line(2.0, 2.3, 2.6, 3.0), null) }
    }

    @Test
    fun `rejects a modifier that does not apply`() {
        assertFailsWith<InvalidInputException> { catalog.validate("10031000001211000000", point(), mapOf("ZZ" to "x")) }
    }
```

Append inside `FeatureApiTest`:

```kotlin
    private val flotLine = """{"type":"LineString","coordinates":[[2.0,48.0],[2.5,48.2],[3.0,48.1]]}"""

    @Test
    fun `places APP-6D graphics with their own geometry`() {
        post("""{"kind":"APP6","geometry":$flotLine,"sidc":"10032500001401000000"}""").andExpect { status { isCreated() } }
        post("""{"kind":"APP6","geometry":$polygon,"sidc":"10032500001512000000","modifiers":{"T":"BP1"}}""")
            .andExpect { status { isCreated() } }
    }

    @Test
    fun `rejects an APP-6D symbol drawn with the wrong geometry`() {
        post("""{"kind":"APP6","geometry":$point,"sidc":"10032500001401000000"}""").andExpect {
            status { isBadRequest() }
            jsonPath("$.detail") { value("Forward Line of Troops must be drawn as a LineString") }
        }
        post("""{"kind":"APP6","geometry":$polygon,"sidc":"10031000001211000000"}""").andExpect { status { isBadRequest() } }
        mvc.get(features()) { with(planner()) }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `rejects an unknown or non APP-6D symbol`() {
        post("""{"kind":"APP6","geometry":$point,"sidc":"99999999999999999999"}""").andExpect { status { isBadRequest() } }
        post("""{"kind":"APP6","geometry":$point,"sidc":"11031000001211000000"}""").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `rejects a modifier that does not apply to the symbol`() {
        post("""{"kind":"APP6","geometry":$point,"sidc":"10031000001211000000","modifiers":{"ZZ":"x"}}""")
            .andExpect { status { isBadRequest() } }
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && ./gradlew test --tests geomap.server.symbology.SymbolCatalogTest --tests geomap.server.mission.FeatureApiTest`
Expected: FAIL — compilation error `Unresolved reference 'validate'` in `SymbolCatalogTest`.

- [ ] **Step 3: Write the implementation**

In `SymbolCatalog`, add the imports `geomap.server.mission.GeoJsonGeometry` and `geomap.server.web.InvalidInputException`, then add inside the class:

```kotlin
    fun validate(
        sidc: String?,
        geometry: Map<String, Any?>,
        modifiers: Map<String, String>?,
    ): SymbolInfo {
        if (sidc == null) invalid("an APP-6D symbol needs a SIDC")
        val symbol = describe(sidc) ?: invalid("unknown APP-6D symbol: $sidc")
        val expected =
            when (symbol.geometry) {
                SymbolGeometry.POINT -> "Point"
                SymbolGeometry.LINE -> "LineString"
                SymbolGeometry.AREA -> "Polygon"
            }
        if (geometry["type"] != expected) invalid("${symbol.name} must be drawn as a $expected")
        val points = GeoJsonGeometry.controlPoints(geometry).size
        if (points !in symbol.minPoints..symbol.maxPoints) invalid("${symbol.name} needs ${symbol.minPoints} to ${symbol.maxPoints} points")
        modifiers?.keys?.firstOrNull { it !in symbol.modifiers }?.let { invalid("modifier $it does not apply to ${symbol.name}") }
        return symbol
    }

    private fun invalid(message: String): Nothing = throw InvalidInputException(message)
```

In `FeatureService`:
- add the constructor parameter `private val symbols: SymbolCatalog` (import `geomap.server.symbology.SymbolCatalog`);
- in `validate`, replace the `FeatureKind.APP6 -> …` branch with `FeatureKind.APP6 -> symbols.validate(input.sidc, input.geometry, input.modifiers)`;
- delete the now-unused `SIDC` regex (and the companion object if it becomes empty).

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; all tests pass, including the 2a test `an APP-6 symbol needs a 20 digit SIDC` (still 400 for a missing or short SIDC, 201 for Infantry with `T`).

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): enforce APP-6D placement rules on mission objects"
```

---

### Task 4: Symbols API for the web editor

**Files:**
- Create: `server/src/main/kotlin/geomap/server/symbology/SymbolController.kt`
- Test: `server/src/test/kotlin/geomap/server/symbology/SymbolApiTest.kt`

**Interfaces:**
- Consumes: `SymbolCatalog.search/describe/validate`, `SymbolRenderer.icon/graphic`, `RenderBand.forZoom`, `GeoJsonGeometry.validate/controlPoints`.
- Produces (role `planificateur`):
  - `GET /api/symbols?q=<words>&limit=<1..100, default 20>` → `List<SymbolInfo>`
  - `GET /api/symbols/{sidc}/icon.png?size=<16..256, default 64>&<letter>=<value>…` → `image/png`, headers `X-Anchor-X`, `X-Anchor-Y`, `Cache-Control: max-age=86400`; only `POINT` symbols; every query parameter other than `size` must be a modifier letter that applies to the symbol
  - `POST /api/symbols/{sidc}/graphic` with body `{"geometry": {...}, "modifiers": {...}?, "zoom": <0..22>}` → GeoJSON `FeatureCollection`; only `LINE`/`AREA` symbols
- `data class GraphicPreview(geometry: Map<String, Any?>, modifiers: Map<String, String>? = null, zoom: Int)`

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/symbology/SymbolApiTest.kt`:

```kotlin
package geomap.server.symbology

import geomap.server.IntegrationTest
import org.hamcrest.Matchers.greaterThan
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

class SymbolApiTest : IntegrationTest() {
    private val flotLine = """{"type":"LineString","coordinates":[[2.0,48.0],[2.5,48.2],[3.0,48.1]]}"""

    @Test
    fun `searches the catalogue`() {
        mvc.get("/api/symbols?q=infantry&limit=3") { with(planner()) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(3) }
            jsonPath("$[0].geometry") { exists() }
        }
    }

    @Test
    fun `rejects a search limit out of range`() {
        mvc.get("/api/symbols?limit=0") { with(planner()) }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `serves a point symbol icon`() {
        mvc.get("/api/symbols/10031000001211000000/icon.png?size=48&T=1ER%20RI") { with(planner()) }.andExpect {
            status { isOk() }
            content { contentType(MediaType.IMAGE_PNG) }
            header { exists("X-Anchor-X") }
            header { string("Cache-Control", "max-age=86400") }
        }
    }

    @Test
    fun `refuses an icon for an unknown symbol, a graphic or an unknown parameter`() {
        mvc.get("/api/symbols/99999999999999999999/icon.png") { with(planner()) }.andExpect { status { isBadRequest() } }
        mvc.get("/api/symbols/10032500001401000000/icon.png") { with(planner()) }.andExpect { status { isBadRequest() } }
        mvc.get("/api/symbols/10031000001211000000/icon.png?colour=red") { with(planner()) }.andExpect { status { isBadRequest() } }
        mvc.get("/api/symbols/10031000001211000000/icon.png?size=2000") { with(planner()) }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `previews a tactical graphic at a zoom level`() {
        mvc
            .post("/api/symbols/10032500001401000000/graphic") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"geometry":$flotLine,"zoom":12}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.type") { value("FeatureCollection") }
                jsonPath("$.features.length()") { value(greaterThan(0)) }
            }
    }

    @Test
    fun `refuses a preview with the wrong geometry or zoom`() {
        mvc
            .post("/api/symbols/10032500001401000000/graphic") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"geometry":{"type":"Point","coordinates":[2.0,48.0]},"zoom":12}"""
            }.andExpect { status { isBadRequest() } }
        mvc
            .post("/api/symbols/10032500001401000000/graphic") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"geometry":$flotLine,"zoom":30}"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `needs the planner role`() {
        mvc.get("/api/symbols") { with(admin()) }.andExpect { status { isForbidden() } }
        mvc.get("/api/symbols").andExpect { status { isUnauthorized() } }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.symbology.SymbolApiTest`
Expected: FAIL — the routes do not exist (404 instead of 200/400). `needs the planner role` may already pass (401/403 happen before routing) — it pins the rule once routes exist.

- [ ] **Step 3: Write the implementation**

`server/src/main/kotlin/geomap/server/symbology/SymbolController.kt`:

```kotlin
package geomap.server.symbology

import geomap.server.mission.GeoJsonGeometry
import geomap.server.web.InvalidInputException
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Duration

data class GraphicPreview(
    val geometry: Map<String, Any?>,
    val modifiers: Map<String, String>? = null,
    val zoom: Int,
)

@RestController
@RequestMapping("/api/symbols")
@PreAuthorize("hasRole('planificateur')")
class SymbolController(
    private val catalog: SymbolCatalog,
    private val renderer: SymbolRenderer,
) {
    @GetMapping
    fun search(
        @RequestParam(defaultValue = "") q: String,
        @RequestParam(defaultValue = "20") limit: Int,
    ): List<SymbolInfo> {
        if (limit !in 1..100) throw InvalidInputException("limit must be between 1 and 100")
        return catalog.search(q, limit)
    }

    @GetMapping("/{sidc}/icon.png", produces = [MediaType.IMAGE_PNG_VALUE])
    fun icon(
        @PathVariable sidc: String,
        @RequestParam params: Map<String, String>,
    ): ResponseEntity<ByteArray> {
        val size = params["size"]?.let { it.toIntOrNull() ?: invalidSize() } ?: 64
        if (size !in 16..256) invalidSize()
        val symbol = catalog.describe(sidc) ?: throw InvalidInputException("unknown APP-6D symbol: $sidc")
        if (symbol.geometry != SymbolGeometry.POINT) throw InvalidInputException("${symbol.name} is a graphic, not an icon")
        val modifiers = params - "size"
        modifiers.keys.firstOrNull { it !in symbol.modifiers }?.let { throw InvalidInputException("unknown parameter: $it") }
        val icon = renderer.icon(sidc, modifiers, size)
        return ResponseEntity
            .ok()
            .cacheControl(CacheControl.maxAge(Duration.ofDays(1)))
            .header("X-Anchor-X", "${icon.anchorX}")
            .header("X-Anchor-Y", "${icon.anchorY}")
            .contentType(MediaType.IMAGE_PNG)
            .body(icon.png)
    }

    @PostMapping("/{sidc}/graphic")
    fun graphic(
        @PathVariable sidc: String,
        @RequestBody preview: GraphicPreview,
    ): Map<String, Any?> {
        val band = RenderBand.forZoom(preview.zoom)
        GeoJsonGeometry.validate(preview.geometry)
        val symbol = catalog.validate(sidc, preview.geometry, preview.modifiers)
        if (symbol.geometry == SymbolGeometry.POINT) throw InvalidInputException("${symbol.name} is an icon, not a graphic")
        return renderer.graphic(sidc, GeoJsonGeometry.controlPoints(preview.geometry), preview.modifiers.orEmpty(), band)
    }

    private fun invalidSize(): Nothing = throw InvalidInputException("size must be between 16 and 256")
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `SymbolApiTest` (7 tests) and all earlier tests pass, including 2a's OpenAPI test.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): expose symbol catalogue, icons and graphic previews"
```

---

### Task 5: Mission validator

**Files:**
- Create: `server/src/main/kotlin/geomap/server/mission/MissionValidator.kt`
- Test: `server/src/test/kotlin/geomap/server/mission/MissionValidationTest.kt`

**Interfaces:**
- Consumes: `MissionService.get` (2a), `FeatureRepository.findByMission/insert` (2a), `SymbolCatalog.validate`, `SymbolRenderer.icon/graphic`, `GeoJsonGeometry.controlPoints`, `RenderBand`.
- Produces: `data class ValidationIssue(code: String, message: String, featureId: UUID? = null)`; `data class ValidationReport(errors: List<ValidationIssue>, warnings: List<ValidationIssue>)` with `val publishable: Boolean` (= no errors); `@Service class MissionValidator` with `validate(missionId: UUID): ValidationReport`; `GET /api/missions/{missionId}/validation` (role `planificateur`) — the contract plan 2c's publication will enforce.

Rules — objects counted are `HUMAN` or `ACCEPTED` (pending and rejected suggestions are not published):
- Errors: `NO_BASEMAP` ("mission has no basemap"), `NO_EXPIRY` ("mission has no expiry date"), `EXPIRED` ("mission expiry date is past"), `SYMBOL_NOT_RENDERABLE` (per APP-6D object that fails `SymbolCatalog.validate` or rendering; message from the failure; `featureId` set).
- Warnings: `PENDING_SUGGESTIONS` ("<n> suggestion(s) awaiting a decision will not be published"), `EMPTY_MISSION` ("mission has no object to publish").

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/mission/MissionValidationTest.kt`:

```kotlin
package geomap.server.mission

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import org.hamcrest.Matchers.containsInAnyOrder
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.time.Instant
import java.util.UUID

class MissionValidationTest : IntegrationTest() {
    @Autowired
    private lateinit var features: FeatureRepository

    private lateinit var missionId: String

    private val infantry = """{"kind":"APP6","geometry":{"type":"Point","coordinates":[2.35,48.85]},"sidc":"10031000001211000000"}"""
    private val flot =
        """{"kind":"APP6","geometry":{"type":"LineString","coordinates":[[2.0,48.0],[3.0,48.1]]},"sidc":"10032500001401000000"}"""

    private fun createMission(body: String): String {
        val result =
            mvc
                .post("/api/missions") {
                    with(planner())
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andReturn()
        return JsonPath.read(result.response.contentAsString, "$.id")
    }

    @BeforeEach
    fun createCompleteMission() {
        missionId = createMission("""{"name":"Op Nord","basemapId":"zone-nord","validUntil":"2099-01-01T00:00:00Z"}""")
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

    private fun validation() = mvc.get("/api/missions/$missionId/validation") { with(planner()) }

    @Test
    fun `a complete mission is publishable`() {
        add(infantry)
        add(flot)
        validation().andExpect {
            status { isOk() }
            jsonPath("$.publishable") { value(true) }
            jsonPath("$.errors.length()") { value(0) }
            jsonPath("$.warnings.length()") { value(0) }
        }
    }

    @Test
    fun `a mission without basemap nor expiry is not publishable`() {
        missionId = createMission("""{"name":"Op Vide"}""")
        validation().andExpect {
            jsonPath("$.publishable") { value(false) }
            jsonPath("$.errors[*].code") { value(containsInAnyOrder("NO_BASEMAP", "NO_EXPIRY")) }
            jsonPath("$.warnings[0].code") { value("EMPTY_MISSION") }
        }
    }

    @Test
    fun `an expired mission is not publishable`() {
        add(infantry)
        jdbc
            .sql("UPDATE mission SET valid_until = now() - interval '1 day' WHERE id = CAST(:id AS uuid)")
            .param("id", missionId)
            .update()
        validation().andExpect { jsonPath("$.errors[0].code") { value("EXPIRED") } }
    }

    @Test
    fun `pending suggestions are a warning, not an error`() {
        add(infantry)
        add(flot, agent())
        validation().andExpect {
            jsonPath("$.publishable") { value(true) }
            jsonPath("$.warnings[0].code") { value("PENDING_SUGGESTIONS") }
        }
    }

    @Test
    fun `a stored object that no longer renders is reported with its id`() {
        add(infantry)
        val now = Instant.now()
        val broken =
            Feature(
                id = UUID.randomUUID(),
                missionId = UUID.fromString(missionId),
                kind = FeatureKind.APP6,
                geometry = mapOf("type" to "Point", "coordinates" to listOf(2.0, 48.0)),
                bbox = BBox(2.0, 48.0, 2.0, 48.0),
                name = "",
                description = "",
                style = null,
                sidc = "10039999999999999999",
                modifiers = null,
                origin = FeatureOrigin.HUMAN,
                suggestionStatus = null,
                createdAt = now,
                updatedAt = now,
            )
        features.insert(broken)
        validation().andExpect {
            status { isOk() }
            jsonPath("$.publishable") { value(false) }
            jsonPath("$.errors[0].code") { value("SYMBOL_NOT_RENDERABLE") }
            jsonPath("$.errors[0].featureId") { value(broken.id.toString()) }
        }
    }

    @Test
    fun `an unknown mission is not found`() {
        mvc
            .get("/api/missions/00000000-0000-0000-0000-000000000000/validation") { with(planner()) }
            .andExpect { status { isNotFound() } }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.mission.MissionValidationTest`
Expected: FAIL — the `/validation` route does not exist (404 where 200 is expected). `an unknown mission is not found` may already pass (a missing route is also a 404) — it pins 404-not-500 once the route exists.

- [ ] **Step 3: Write the implementation**

`server/src/main/kotlin/geomap/server/mission/MissionValidator.kt`:

```kotlin
package geomap.server.mission

import geomap.server.symbology.RenderBand
import geomap.server.symbology.SymbolCatalog
import geomap.server.symbology.SymbolGeometry
import geomap.server.symbology.SymbolRenderer
import geomap.server.web.InvalidInputException
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import java.time.Clock
import java.util.UUID

data class ValidationIssue(
    val code: String,
    val message: String,
    val featureId: UUID? = null,
)

data class ValidationReport(
    val errors: List<ValidationIssue>,
    val warnings: List<ValidationIssue>,
) {
    val publishable: Boolean get() = errors.isEmpty()
}

@Service
class MissionValidator(
    private val missions: MissionService,
    private val features: FeatureRepository,
    private val catalog: SymbolCatalog,
    private val renderer: SymbolRenderer,
    private val clock: Clock,
) {
    fun validate(missionId: UUID): ValidationReport {
        val mission = missions.get(missionId)
        val all = features.findByMission(missionId)
        val published = all.filter { it.origin == FeatureOrigin.HUMAN || it.suggestionStatus == SuggestionStatus.ACCEPTED }
        val errors = mutableListOf<ValidationIssue>()
        val warnings = mutableListOf<ValidationIssue>()

        if (mission.basemapId == null) errors += ValidationIssue("NO_BASEMAP", "mission has no basemap")
        val validUntil = mission.validUntil
        when {
            validUntil == null -> errors += ValidationIssue("NO_EXPIRY", "mission has no expiry date")
            !validUntil.isAfter(clock.instant()) -> errors += ValidationIssue("EXPIRED", "mission expiry date is past")
        }
        published.filter { it.kind == FeatureKind.APP6 }.forEach { feature ->
            renderingProblem(feature)?.let { errors += ValidationIssue("SYMBOL_NOT_RENDERABLE", it, feature.id) }
        }

        val pending = all.count { it.suggestionStatus == SuggestionStatus.PENDING }
        if (pending > 0) warnings += ValidationIssue("PENDING_SUGGESTIONS", "$pending suggestion(s) awaiting a decision will not be published")
        if (published.isEmpty()) warnings += ValidationIssue("EMPTY_MISSION", "mission has no object to publish")
        return ValidationReport(errors, warnings)
    }

    // ponytail: renders every symbol on each call; cache per (sidc, geometry, band) if large missions make validation slow.
    private fun renderingProblem(feature: Feature): String? =
        try {
            val symbol = catalog.validate(feature.sidc, feature.geometry, feature.modifiers)
            val sidc = feature.sidc!!
            val modifiers = feature.modifiers.orEmpty()
            if (symbol.geometry == SymbolGeometry.POINT) {
                renderer.icon(sidc, modifiers, 64)
            } else {
                renderer.graphic(sidc, GeoJsonGeometry.controlPoints(feature.geometry), modifiers, RenderBand.MID)
            }
            null
        } catch (e: InvalidInputException) {
            e.message
        }
}

@RestController
@PreAuthorize("hasRole('planificateur')")
class MissionValidationController(
    private val validator: MissionValidator,
) {
    @GetMapping("/api/missions/{missionId}/validation")
    fun validate(
        @PathVariable missionId: UUID,
    ): ValidationReport = validator.validate(missionId)
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `MissionValidationTest` (6 tests) and all earlier tests pass.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add mission validator with publication blockers and warnings"
```
