package geomap.server.basemap

import geomap.pkg.Sha256
import geomap.server.IntegrationTest
import geomap.server.TestPmtiles
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import kotlin.test.assertContentEquals

class BasemapTilesTest : IntegrationTest() {
    private val tiles = TestPmtiles.build(size = 200_000, seed = 11)

    @BeforeEach
    fun uploadBasemap() {
        mvc
            .put("/api/basemaps/zone-nord?name=Zone Nord") {
                with(admin())
                contentType = MediaType.APPLICATION_OCTET_STREAM
                content = tiles
            }.andExpect { status { isCreated() } }
    }

    private fun fetch(range: String? = null) =
        mvc.get("/api/basemaps/zone-nord/pmtiles") {
            with(planner())
            range?.let { header("Range", it) }
        }

    @Test
    fun `serves the whole file without a range`() {
        val body =
            fetch()
                .andExpect {
                    status { isOk() }
                    header { string("Accept-Ranges", "bytes") }
                    header { string("ETag", "\"${Sha256.hex(tiles)}\"") }
                    header { string("Content-Type", "application/vnd.pmtiles") }
                    header { longValue("Content-Length", tiles.size.toLong()) }
                }.andReturn()
                .response.contentAsByteArray
        assertContentEquals(tiles, body)
    }

    @Test
    fun `serves the requested byte range`() {
        val body =
            fetch("bytes=0-16383")
                .andExpect {
                    status { isPartialContent() }
                    header { string("Content-Range", "bytes 0-16383/200000") }
                    header { longValue("Content-Length", 16384) }
                }.andReturn()
                .response.contentAsByteArray
        assertContentEquals(tiles.copyOfRange(0, 16384), body)
    }

    @Test
    fun `serves open-ended and suffix ranges`() {
        val tail = fetch("bytes=199990-").andExpect { status { isPartialContent() } }.andReturn().response
        assertContentEquals(tiles.copyOfRange(199_990, 200_000), tail.contentAsByteArray)
        val suffix =
            fetch("bytes=-10")
                .andExpect { header { string("Content-Range", "bytes 199990-199999/200000") } }
                .andReturn()
                .response
        assertContentEquals(tiles.copyOfRange(199_990, 200_000), suffix.contentAsByteArray)
    }

    @Test
    fun `refuses a range past the end, several ranges or a malformed header`() {
        fetch("bytes=200000-200010").andExpect {
            status { isRequestedRangeNotSatisfiable() }
            header { string("Content-Range", "bytes */200000") }
        }
        fetch("bytes=0-1,5-6").andExpect { status { isRequestedRangeNotSatisfiable() } }
        fetch("bytes=abc").andExpect { status { isRequestedRangeNotSatisfiable() } }
    }

    @Test
    fun `an unknown basemap is not found`() {
        mvc.get("/api/basemaps/zone-sud/pmtiles") { with(planner()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `administrators read tiles too and anonymous callers do not`() {
        mvc.get("/api/basemaps/zone-nord/pmtiles") { with(admin()) }.andExpect { status { isOk() } }
        mvc.get("/api/basemaps/zone-nord/pmtiles").andExpect { status { isUnauthorized() } }
    }
}
