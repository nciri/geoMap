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
