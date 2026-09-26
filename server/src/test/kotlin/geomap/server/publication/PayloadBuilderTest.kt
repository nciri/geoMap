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
            mapOf(
                "type" to "Polygon",
                "coordinates" to listOf(listOf(listOf(2.0, 48.0), listOf(3.0, 48.0), listOf(3.0, 49.0), listOf(2.0, 48.0))),
            ),
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
