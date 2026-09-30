package geomap.server.publication

import com.jayway.jsonpath.JsonPath
import geomap.pkg.Manifest
import geomap.pkg.MissionPayload
import geomap.pkg.PackageVerifier
import geomap.pkg.SoftwareKeyUnwrapper
import geomap.pkg.VerifyContext
import geomap.pkg.VerifyResult
import geomap.pkg.ZoomBand
import geomap.server.IntegrationTest
import geomap.server.TestDevices
import geomap.server.basemap.Basemap
import geomap.server.basemap.BasemapKind
import geomap.server.basemap.BasemapRepository
import geomap.server.device.AssignmentRepository
import geomap.server.device.Device
import geomap.server.device.DeviceRepository
import geomap.server.mission.BBox
import geomap.server.security.ServerSigningKey
import geomap.server.storage.ObjectStore
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PublicationApiTest : IntegrationTest() {
    @Autowired private lateinit var basemaps: BasemapRepository

    @Autowired private lateinit var devices: DeviceRepository

    @Autowired private lateinit var assignments: AssignmentRepository

    @Autowired private lateinit var versions: MissionVersionRepository

    @Autowired private lateinit var store: ObjectStore

    @Autowired private lateinit var signingKey: ServerSigningKey

    private lateinit var missionId: String
    private lateinit var deviceA: Device

    private val infantry = """{"kind":"APP6","geometry":{"type":"Point","coordinates":[2.35,48.85]},"sidc":"10031000001211000000"}"""
    private val flot =
        """{"kind":"APP6","geometry":{"type":"LineString","coordinates":[[2.0,48.0],[3.0,48.1]]},"sidc":"10032500001401000000"}"""

    @BeforeEach
    fun completeMission() {
        basemaps.insert(Basemap("zone-nord", "Zone Nord", 1, "basemaps/zone-nord/x.pmtiles", "b".repeat(64), "c2ln", "root", Instant.now()))
        val body =
            mvc
                .post("/api/missions") {
                    with(planner())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"name":"Op Nord","layers":["zone-nord"],"validUntil":"2099-01-01T00:00:00Z"}"""
                }.andReturn()
                .response.contentAsString
        missionId = JsonPath.read(body, "$.id")
        deviceA = TestDevices.insert(devices, 'a')
        assignments.replace(UUID.fromString(missionId), setOf(deviceA.id))
        add(infantry)
        add(flot)
    }

    private fun add(
        body: String,
        who: RequestPostProcessor = planner(),
    ) {
        mvc
            .post("/api/missions/$missionId/features") {
                with(who)
                contentType = MediaType.APPLICATION_JSON
                content = body
            }.andExpect { status { isCreated() } }
    }

    private fun publish(who: RequestPostProcessor = planner()) = mvc.post("/api/missions/$missionId/publish") { with(who) }

    private fun latestPackage(): ByteArray = store.get(versions.latest(UUID.fromString(missionId))!!.objectKey).use { it.readBytes() }

    private fun open(
        bytes: ByteArray,
        device: Device = deviceA,
    ): Pair<Manifest, MissionPayload> {
        val context =
            VerifyContext(
                device.certSha256,
                SoftwareKeyUnwrapper(TestDevices.keys.private),
                signingKey.publicKey,
                Instant.now(),
                { null },
                { true },
            )
        val accepted = assertIs<VerifyResult.Accepted>(PackageVerifier.verify(bytes, context))
        return accepted.manifest to accepted.payload
    }

    @Test
    fun `publishes a package the assigned device can open`() {
        publish().andExpect {
            status { isCreated() }
            jsonPath("$.version") { value(1) }
            jsonPath("$.recipients") { value(1) }
        }
        val (manifest, payload) = open(latestPackage())
        assertEquals(missionId, manifest.missionId)
        assertEquals(1, manifest.version)
        assertEquals("b".repeat(64), manifest.basemap.sha256)
        assertEquals("2099-01-01T00:00:00Z", manifest.validUntil)
        assertEquals("# Op Nord\n", payload.summary)
        assertEquals(1, payload.icons.size)
        assertTrue(payload.features.getValue(ZoomBand.MID).contains("MultiLineString"))
        mvc.get("/api/missions/$missionId") { with(planner()) }.andExpect { jsonPath("$.status") { value("PUBLISHED") } }
    }

    @Test
    fun `the package carries the vector basemap, not the imagery above it`() {
        basemaps.insert(
            Basemap(
                "paris-ortho",
                "Paris ortho",
                1,
                "basemaps/paris-ortho/x.pmtiles",
                "c".repeat(64),
                "c2ln",
                "root",
                Instant.now(),
                kind = BasemapKind.RASTER,
                bounds = BBox(2.2, 48.78, 2.47, 48.94),
            ),
        )
        mvc
            .patch("/api/missions/$missionId") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"layers":["zone-nord","paris-ortho"]}"""
            }.andExpect { status { isOk() } }
        publish().andExpect { status { isCreated() } }
        assertEquals("zone-nord", open(latestPackage()).first.basemap.id)
    }

    @Test
    fun `each publication is a new version`() {
        publish()
        publish().andExpect { jsonPath("$.version") { value(2) } }
        assertEquals(2, open(latestPackage()).first.version)
        mvc.get("/api/missions/$missionId/versions") { with(planner()) }.andExpect {
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].version") { value(2) }
        }
    }

    @Test
    fun `pending suggestions are never published`() {
        add("""{"kind":"GENERIC","geometry":{"type":"Point","coordinates":[2.0,48.0]},"name":"Suggestion IA"}""", agent())
        publish()
        val payload = open(latestPackage()).second
        ZoomBand.entries.forEach { assertFalse(payload.features.getValue(it).contains("Suggestion IA")) }
    }

    @Test
    fun `an unpublishable mission is refused and nothing is stored`() {
        jdbc.sql("UPDATE mission SET layers = '{}' WHERE id = CAST(:id AS uuid)").param("id", missionId).update()
        publish().andExpect {
            status { isConflict() }
            jsonPath("$.detail") { value("mission is not publishable: NO_BASEMAP") }
        }
        assertNull(versions.latest(UUID.fromString(missionId)))
    }

    @Test
    fun `a mission whose devices are all revoked is refused`() {
        jdbc.sql("UPDATE device SET status = 'REVOKED'").update()
        publish().andExpect { status { isConflict() } }
        assertNull(versions.latest(UUID.fromString(missionId)))
    }

    @Test
    fun `only a human publishes`() {
        publish(agent()).andExpect { status { isForbidden() } }
        assertNull(versions.latest(UUID.fromString(missionId)))
    }

    @Test
    fun `a withdrawn or unknown mission cannot be published`() {
        jdbc.sql("UPDATE mission SET status = 'WITHDRAWN' WHERE id = CAST(:id AS uuid)").param("id", missionId).update()
        publish().andExpect { status { isConflict() } }
        mvc.post("/api/missions/00000000-0000-0000-0000-000000000000/publish") { with(planner()) }.andExpect { status { isNotFound() } }
    }
}
