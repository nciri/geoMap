package geomap.server.device

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.RequestPostProcessor

class AssignmentApiTest : IntegrationTest() {
    private lateinit var missionId: String
    private lateinit var deviceA: String
    private lateinit var deviceB: String

    private fun device(cert: Char): String {
        val body =
            mvc
                .post("/api/devices") {
                    with(admin())
                    contentType = MediaType.APPLICATION_JSON
                    content = DeviceApiTest.registration(name = "Tablette $cert", cert = "$cert".repeat(64))
                }.andReturn()
                .response.contentAsString
        return JsonPath.read(body, "$.id")
    }

    @BeforeEach
    fun setUp() {
        val body =
            mvc
                .post("/api/missions") {
                    with(planner())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"name":"Op Nord"}"""
                }.andReturn()
                .response.contentAsString
        missionId = JsonPath.read(body, "$.id")
        deviceA = device('a')
        deviceB = device('b')
    }

    private fun assign(
        vararg ids: String,
        who: RequestPostProcessor = planner(),
        mission: String = missionId,
    ) = mvc.put("/api/missions/$mission/devices") {
        with(who)
        contentType = MediaType.APPLICATION_JSON
        content = """{"deviceIds":[${ids.joinToString(",") { "\"$it\"" }}]}"""
    }

    private fun assigned() = mvc.get("/api/missions/$missionId/devices") { with(planner()) }

    @Test
    fun `a planner assigns enrolled devices`() {
        assign(deviceA, deviceB).andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
        }
        assigned().andExpect { jsonPath("$.length()") { value(2) } }
    }

    @Test
    fun `a new assignment replaces the previous one`() {
        assign(deviceA, deviceB)
        assign(deviceB)
        assigned().andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(deviceB) }
        }
    }

    @Test
    fun `refuses a revoked or unknown device and changes nothing`() {
        assign(deviceA)
        mvc.post("/api/devices/$deviceB/revoke") { with(admin()) }
        assign(deviceA, deviceB).andExpect { status { isBadRequest() } }
        assign("00000000-0000-0000-0000-000000000000").andExpect { status { isBadRequest() } }
        assigned().andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(deviceA) }
        }
    }

    @Test
    fun `an agent cannot assign devices`() {
        assign(deviceA, who = agent()).andExpect { status { isForbidden() } }
        assigned().andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `a withdrawn or unknown mission cannot be assigned`() {
        jdbc.sql("UPDATE mission SET status = 'WITHDRAWN' WHERE id = CAST(:id AS uuid)").param("id", missionId).update()
        assign(deviceA).andExpect { status { isConflict() } }
        assign(deviceA, mission = "00000000-0000-0000-0000-000000000000").andExpect { status { isNotFound() } }
    }

    @Test
    fun `assigning does not change the mission status`() {
        jdbc.sql("UPDATE mission SET status = 'PUBLISHED' WHERE id = CAST(:id AS uuid)").param("id", missionId).update()
        assign(deviceA)
        mvc.get("/api/missions/$missionId") { with(planner()) }.andExpect { jsonPath("$.status") { value("PUBLISHED") } }
    }
}
