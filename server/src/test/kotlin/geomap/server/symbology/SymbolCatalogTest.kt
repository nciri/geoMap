package geomap.server.symbology

import geomap.server.web.InvalidInputException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
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

    @Test
    fun `search lists no symbol that could never be placed`() {
        val results = catalog.search("", 5000)
        assertTrue(results.isNotEmpty())
        results.forEach { symbol ->
            val placeable =
                when (symbol.geometry) {
                    SymbolGeometry.POINT -> 1 in symbol.minPoints..symbol.maxPoints
                    SymbolGeometry.LINE -> symbol.maxPoints >= 2
                    SymbolGeometry.AREA -> symbol.maxPoints >= 3
                }
            assertTrue(placeable, "${symbol.basicId} ${symbol.name} cannot be placed: ${symbol.minPoints}..${symbol.maxPoints}")
        }
    }

    @Test
    fun `does not describe a category header with no placeable geometry`() {
        // "Command and Control Lines" category header: symbol set Control Measure, entity code 110000, point geometry with 0..0 points.
        // Found by probing MSLookup.getIDList(Version_APP6D) for basicId 25110000 (min=0, max=0) and rebuilding the full SIDC
        // with SymbolID.setSymbolSet(..., 25) / setEntityCode(..., 110000) on a known-good template.
        assertNull(catalog.describe("10032500001100000000"))
    }

    @Test
    fun `does not describe an Area symbol whose bounds cannot form a polygon`() {
        // "Retain" (Control Measure / Maneuver Areas / Battle Position): Area geometry but maxPoints = 2 (basicId 25151205),
        // found the same way as the category header above; a Polygon needs at least 3 control points.
        assertNull(catalog.describe("10032500001512050000"))
    }

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

    @Test
    fun `caps control points of a symbol with no natural upper bound`() {
        // FLOT has maxPoints = Int.MAX_VALUE; capped to bound time spent holding the render lock (SymbolCatalog.MAX_CONTROL_POINTS).
        val lons = DoubleArray(2000) { -10.0 + it * 0.001 }
        assertEquals(SymbolGeometry.LINE, catalog.validate("10032500001401000000", line(*lons), null).geometry)
        val tooMany = DoubleArray(2001) { -10.0 + it * 0.001 }
        val error = assertFailsWith<InvalidInputException> { catalog.validate("10032500001401000000", line(*tooMany), null) }
        assertEquals("Forward Line of Troops needs 2 to 2000 points", error.message)
    }
}
