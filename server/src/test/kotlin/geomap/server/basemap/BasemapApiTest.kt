package geomap.server.basemap

import com.jayway.jsonpath.JsonPath
import geomap.pkg.BasemapSignature
import geomap.pkg.Sha256
import geomap.pkg.unb64
import geomap.server.IntegrationTest
import geomap.server.security.ServerSigningKey
import geomap.server.storage.ObjectStore
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.nio.file.Files
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import kotlin.random.Random
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BasemapApiTest : IntegrationTest() {
    @Autowired
    private lateinit var store: ObjectStore

    @Autowired
    private lateinit var basemaps: BasemapRepository

    @Autowired
    private lateinit var signingKey: ServerSigningKey

    private val tiles = Random(7).nextBytes(200_000)

    private fun upload(
        id: String = "zone-nord",
        bytes: ByteArray = tiles,
        who: RequestPostProcessor = admin(),
        name: String? = "Zone Nord",
    ) = mvc.put("/api/basemaps/$id" + (name?.let { "?name=$it" } ?: "")) {
        with(who)
        contentType = MediaType.APPLICATION_OCTET_STREAM
        content = bytes
    }

    private fun stored(id: String) = store.get(basemaps.find(id)!!.objectKey).use { it.readBytes() }

    @Test
    fun `an administrator registers a signed basemap`() {
        val body =
            upload()
                .andExpect {
                    status { isCreated() }
                    jsonPath("$.id") { value("zone-nord") }
                    jsonPath("$.sizeBytes") { value(tiles.size) }
                    jsonPath("$.sha256") { value(Sha256.hex(tiles)) }
                }.andReturn()
                .response.contentAsString
        val file = Files.createTempFile("zone-nord", ".pmtiles")
        Files.write(file, stored("zone-nord"))
        assertContentEquals(tiles, Files.readAllBytes(file))
        assertTrue(BasemapSignature.verify(file, unb64(JsonPath.read(body, "$.signature")), signingKey.publicKey))
    }

    @Test
    fun `a registered basemap cannot be replaced`() {
        upload()
        upload(bytes = Random(8).nextBytes(1000)).andExpect { status { isConflict() } }
        assertContentEquals(tiles, stored("zone-nord"))
    }

    @Test
    fun `rejects an invalid id, a missing name or an empty file`() {
        upload(id = "Zone_Nord").andExpect { status { isBadRequest() } }
        upload(name = null).andExpect { status { isBadRequest() } }
        upload(bytes = ByteArray(0)).andExpect { status { isBadRequest() } }
    }

    @Test
    fun `only an administrator uploads`() {
        upload(who = planner()).andExpect { status { isForbidden() } }
    }

    @Test
    fun `planners and administrators list registered basemaps`() {
        upload()
        mvc.get("/api/basemaps") { with(planner()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value("zone-nord") }
        }
        assertEquals(
            1,
            JsonPath.read<Int>(
                mvc
                    .get("/api/basemaps") { with(admin()) }
                    .andReturn()
                    .response.contentAsString,
                "$.length()",
            ),
        )
    }

    @Test
    fun `concurrent uploads of the same id register exactly one basemap whose signature matches its stored bytes`() {
        val contents = listOf(Random(11).nextBytes(200_000), Random(13).nextBytes(200_000))
        val pool = Executors.newFixedThreadPool(2)
        val tasks =
            contents.map { bytes ->
                Callable { upload(id = "zone-est", bytes = bytes).andReturn().response.status }
            }
        val statuses =
            try {
                pool.invokeAll(tasks).map { it.get() }.sorted()
            } finally {
                pool.shutdown()
            }
        assertEquals(listOf(201, 409), statuses)

        val row = basemaps.find("zone-est")!!
        val file = Files.createTempFile("zone-est", ".pmtiles")
        Files.write(file, store.get(row.objectKey).use { it.readBytes() })
        assertEquals(Sha256.hex(Files.readAllBytes(file)), row.sha256)
        assertTrue(BasemapSignature.verify(file, unb64(row.signature), signingKey.publicKey))
    }
}
