package geomap.server.publication

import com.jayway.jsonpath.JsonPath
import geomap.pkg.PackageVerifier
import geomap.pkg.Rejection
import geomap.pkg.SoftwareKeyUnwrapper
import geomap.pkg.VerifyContext
import geomap.pkg.VerifyResult
import geomap.pkg.ZoomBand
import geomap.server.IntegrationTest
import geomap.server.TestDevices
import geomap.server.basemap.Basemap
import geomap.server.basemap.BasemapRepository
import geomap.server.device.AssignmentRepository
import geomap.server.device.Device
import geomap.server.device.DeviceRepository
import geomap.server.security.ServerSigningKey
import geomap.server.storage.ObjectStore
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class RepublishTest : IntegrationTest() {
    @Autowired private lateinit var basemaps: BasemapRepository

    @Autowired private lateinit var devices: DeviceRepository

    @Autowired private lateinit var assignments: AssignmentRepository

    @Autowired private lateinit var versions: MissionVersionRepository

    @Autowired private lateinit var store: ObjectStore

    @Autowired private lateinit var signingKey: ServerSigningKey

    private lateinit var missionId: String
    private lateinit var deviceA: Device
    private lateinit var deviceB: Device

    @BeforeEach
    fun publishedMission() {
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
        deviceB = TestDevices.insert(devices, 'b')
        assignments.replace(UUID.fromString(missionId), setOf(deviceA.id))
        feature("Point de regroupement")
        mvc.post("/api/missions/$missionId/publish") { with(planner()) }.andExpect { status { isCreated() } }
    }

    private fun feature(name: String) {
        mvc
            .post("/api/missions/$missionId/features") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"kind":"GENERIC","geometry":{"type":"Point","coordinates":[2.0,48.0]},"name":"$name"}"""
            }.andExpect { status { isCreated() } }
    }

    private fun assign(vararg ids: UUID) =
        mvc.put("/api/missions/$missionId/devices") {
            with(planner())
            contentType = MediaType.APPLICATION_JSON
            content = """{"deviceIds":[${ids.joinToString(",") { "\"$it\"" }}]}"""
        }

    private fun latest() = versions.latest(UUID.fromString(missionId))!!

    private fun verify(device: Device) =
        PackageVerifier.verify(
            store.get(latest().objectKey).use { it.readBytes() },
            VerifyContext(
                device.certSha256,
                SoftwareKeyUnwrapper(TestDevices.keys.private),
                signingKey.publicKey,
                Instant.now(),
                { null },
                { true },
            ),
        )

    @Test
    fun `adding a device rebuilds the same version for it`() {
        assertEquals(Rejection.NOT_A_RECIPIENT, assertIs<VerifyResult.Rejected>(verify(deviceB)).reason)
        assign(deviceA.id, deviceB.id).andExpect { status { isOk() } }
        assertEquals(1, latest().number)
        assertEquals(2, latest().recipients)
        assertIs<VerifyResult.Accepted>(verify(deviceA))
        assertIs<VerifyResult.Accepted>(verify(deviceB))
    }

    @Test
    fun `a removed device no longer opens the package`() {
        assign(deviceA.id, deviceB.id)
        assign(deviceB.id)
        assertEquals(Rejection.NOT_A_RECIPIENT, assertIs<VerifyResult.Rejected>(verify(deviceA)).reason)
    }

    @Test
    fun `a rebuild keeps the published snapshot, not the current draft`() {
        feature("Brouillon non publie")
        assign(deviceA.id, deviceB.id)
        val mid = assertIs<VerifyResult.Accepted>(verify(deviceB)).payload.features.getValue(ZoomBand.MID)
        assertFalse(mid.contains("Brouillon non publie"))
        assertTrue(mid.contains("Point de regroupement"))
    }

    @Test
    fun `a published mission cannot lose all its devices`() {
        assign().andExpect { status { isConflict() } }
        assertEquals(listOf(deviceA.id), assignments.devices(UUID.fromString(missionId)).map { it.id })
    }
}
