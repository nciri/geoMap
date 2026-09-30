package geomap.server.publication

import com.jayway.jsonpath.JsonPath
import geomap.pkg.PackageVerifier
import geomap.pkg.SoftwareKeyUnwrapper
import geomap.pkg.VerifyContext
import geomap.pkg.VerifyResult
import geomap.server.IntegrationTest
import geomap.server.TestDevices
import geomap.server.basemap.Basemap
import geomap.server.basemap.BasemapRepository
import geomap.server.device.AssignmentRepository
import geomap.server.device.Device
import geomap.server.device.DeviceRepository
import geomap.server.security.ServerSigningKey
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import java.time.Instant
import java.util.UUID
import kotlin.test.assertIs

class ExportAndWithdrawTest : IntegrationTest() {
    @Autowired private lateinit var basemaps: BasemapRepository

    @Autowired private lateinit var devices: DeviceRepository

    @Autowired private lateinit var assignments: AssignmentRepository

    @Autowired private lateinit var signingKey: ServerSigningKey

    private lateinit var missionId: String
    private lateinit var device: Device

    @BeforeEach
    fun mission() {
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
        device = TestDevices.insert(devices, 'a')
        assignments.replace(UUID.fromString(missionId), setOf(device.id))
        mvc.post("/api/missions/$missionId/features") {
            with(planner())
            contentType = MediaType.APPLICATION_JSON
            content = """{"kind":"GENERIC","geometry":{"type":"Point","coordinates":[2.0,48.0]},"name":"PC"}"""
        }
    }

    private fun publish() = mvc.post("/api/missions/$missionId/publish") { with(planner()) }.andExpect { status { isCreated() } }

    private fun export() = mvc.get("/api/missions/$missionId/package") { with(planner()) }

    @Test
    fun `exports the latest package for an SD card`() {
        publish()
        publish()
        val response =
            export()
                .andExpect {
                    status { isOk() }
                    content { contentType(MediaType.APPLICATION_OCTET_STREAM) }
                    header { string("Content-Disposition", "attachment; filename=\"$missionId-v2.gmp\"") }
                }.andReturn()
                .response
        val context =
            VerifyContext(
                device.certSha256,
                SoftwareKeyUnwrapper(TestDevices.keys.private),
                signingKey.publicKey,
                Instant.now(),
                { null },
                { true },
            )
        assertIs<VerifyResult.Accepted>(PackageVerifier.verify(response.contentAsByteArray, context))
    }

    @Test
    fun `an unpublished mission has nothing to export`() {
        export().andExpect { status { isNotFound() } }
    }

    @Test
    fun `withdrawing freezes the mission and stops exports`() {
        publish()
        mvc.post("/api/missions/$missionId/withdraw") { with(planner()) }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("WITHDRAWN") }
        }
        export().andExpect { status { isConflict() } }
        mvc.post("/api/missions/$missionId/withdraw") { with(planner()) }.andExpect { status { isConflict() } }
    }

    @Test
    fun `only a human withdraws or exports`() {
        publish()
        mvc.post("/api/missions/$missionId/withdraw") { with(agent()) }.andExpect { status { isForbidden() } }
        mvc.get("/api/missions/$missionId/package") { with(agent()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `a mission that was published cannot be deleted`() {
        publish()
        mvc
            .patch("/api/missions/$missionId") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op Nord bis"}"""
            }.andExpect { jsonPath("$.status") { value("DRAFT") } }
        mvc.delete("/api/missions/$missionId") { with(planner()) }.andExpect { status { isConflict() } }
    }
}
