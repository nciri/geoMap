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
