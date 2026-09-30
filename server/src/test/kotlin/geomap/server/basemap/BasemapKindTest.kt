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
