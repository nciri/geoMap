package geomap.server.basemap

import geomap.server.IntegrationTest
import geomap.server.TestPmtiles
import geomap.server.mission.BBox
import geomap.server.storage.ObjectStore
import geomap.server.storage.StorageProperties
import io.minio.ListObjectsArgs
import io.minio.MinioClient
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

    @Autowired
    private lateinit var storage: StorageProperties

    private fun storedObjects(id: String) =
        MinioClient
            .builder()
            .endpoint(storage.endpoint)
            .credentials(storage.accessKey, storage.secretKey)
            .build()
            .listObjects(
                ListObjectsArgs
                    .builder()
                    .bucket(storage.bucket)
                    .prefix("basemaps/$id/")
                    .recursive(true)
                    .build(),
            ).count()

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

    private fun legacy(
        id: String,
        bytes: ByteArray,
    ) {
        store.put("basemaps/$id/1.pmtiles", bytes.inputStream(), bytes.size.toLong(), "application/vnd.pmtiles")
        jdbc
            .sql(
                """
                INSERT INTO basemap (id, name, size_bytes, object_key, sha256, signature, created_by, created_at)
                VALUES (:id, 'Old', :size, :key, :sha, 'sig', 'root', :at)
                """.trimIndent(),
            ).param("id", id)
            .param("size", bytes.size)
            .param("key", "basemaps/$id/1.pmtiles")
            .param("sha", "d".repeat(64))
            .param("at", Timestamp.from(Instant.now()))
            .update()
    }

    // Compresses to a few kilobytes, inflates past the 1 MiB metadata cap.
    private val metadataBomb = TestPmtiles.build(tileType = 3, attribution = "x".repeat(2_000_000))

    @Test
    fun `an archive whose metadata inflates past the cap is refused and nothing is stored`() {
        upload("bomb", metadataBomb).andExpect {
            status { isBadRequest() }
            jsonPath("$.detail") { value("the file is not a valid PMTiles archive") }
        }
        assertNull(basemaps.find("bomb"))
        assertEquals(0, storedObjects("bomb"))
    }

    @Test
    fun `the startup backfill skips an oversized metadata and describes the other basemaps`() {
        legacy("bomb", metadataBomb)
        legacy("old", TestPmtiles.build(tileType = 4, attribution = "© ALIAS"))
        backfill.run(DefaultApplicationArguments())
        assertEquals(BasemapKind.VECTOR, basemaps.find("bomb")!!.kind)
        assertEquals(BasemapKind.RASTER, basemaps.find("old")!!.kind)
    }

    @Test
    fun `a truncated archive is refused and nothing is stored`() {
        upload("cut", TestPmtiles.build(size = 10_000).copyOf(6_000)).andExpect {
            status { isBadRequest() }
            jsonPath("$.detail") { value("the file is not a valid PMTiles archive") }
        }
        assertNull(basemaps.find("cut"))
        assertEquals(0, storedObjects("cut"))
    }

    @Test
    fun `basemaps registered before this change get their kind and bounds at startup`() {
        legacy("old", TestPmtiles.build(tileType = 4, bounds = BBox(1.0, 2.0, 3.0, 4.0), attribution = "© ALIAS"))
        backfill.run(DefaultApplicationArguments())
        val old = basemaps.find("old")!!
        assertEquals(BasemapKind.RASTER, old.kind)
        assertEquals("© ALIAS", old.attribution)
        assertEquals(BBox(1.0, 2.0, 3.0, 4.0), old.bounds)
    }
}
