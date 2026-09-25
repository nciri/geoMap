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
