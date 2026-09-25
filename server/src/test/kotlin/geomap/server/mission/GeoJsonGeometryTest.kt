package geomap.server.mission

import geomap.server.web.InvalidInputException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class GeoJsonGeometryTest {
    private fun geometry(
        type: String,
        coordinates: Any?,
    ) = mapOf("type" to type, "coordinates" to coordinates)

    private val square = listOf(listOf(2.0, 48.0), listOf(3.0, 48.0), listOf(3.0, 49.0), listOf(2.0, 49.0), listOf(2.0, 48.0))

    @Test
    fun `a point has a degenerate bounding box`() {
        assertEquals(BBox(2.35, 48.85, 2.35, 48.85), GeoJsonGeometry.validate(geometry("Point", listOf(2.35, 48.85))))
    }

    @Test
    fun `a point may carry an altitude`() {
        assertEquals(BBox(2.35, 48.85, 2.35, 48.85), GeoJsonGeometry.validate(geometry("Point", listOf(2.35, 48.85, 120.0))))
    }

    @Test
    fun `a line string spans its positions`() {
        val line = geometry("LineString", listOf(listOf(2.0, 48.5), listOf(3.5, 48.0)))
        assertEquals(BBox(2.0, 48.0, 3.5, 48.5), GeoJsonGeometry.validate(line))
    }

    @Test
    fun `a closed polygon is accepted`() {
        assertEquals(BBox(2.0, 48.0, 3.0, 49.0), GeoJsonGeometry.validate(geometry("Polygon", listOf(square))))
    }

    @Test
    fun `accepts integer coordinates`() {
        assertEquals(BBox(2.0, 48.0, 2.0, 48.0), GeoJsonGeometry.validate(geometry("Point", listOf(2, 48))))
    }

    @Test
    fun `rejects an unclosed polygon ring`() {
        val open = square.dropLast(1)
        val error = assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("Polygon", listOf(open))) }
        assertEquals("a polygon ring must be closed", error.message)
    }

    @Test
    fun `rejects a ring with fewer than four positions`() {
        val triangle = listOf(listOf(2.0, 48.0), listOf(3.0, 48.0), listOf(2.0, 48.0))
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("Polygon", listOf(triangle))) }
    }

    @Test
    fun `rejects a line with a single position`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("LineString", listOf(listOf(2.0, 48.0)))) }
    }

    @Test
    fun `rejects a latitude out of range`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("Point", listOf(2.0, 91.0))) }
    }

    @Test
    fun `rejects a longitude out of range`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("Point", listOf(-181.0, 0.0))) }
    }

    @Test
    fun `rejects an unsupported type`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("MultiPoint", listOf(listOf(2.0, 48.0)))) }
    }

    @Test
    fun `rejects non numeric coordinates`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("Point", listOf("2.0", 48.0))) }
    }

    @Test
    fun `rejects missing coordinates`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(mapOf("type" to "Point")) }
    }
}
