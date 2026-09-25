package geomap.server.mission

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.RequestPostProcessor

class FeatureApiTest : IntegrationTest() {
    private lateinit var missionId: String

    private val polygon =
        """{"type":"Polygon","coordinates":[[[2.0,48.0],[3.0,48.0],[3.0,49.0],[2.0,49.0],[2.0,48.0]]]}"""
    private val point = """{"type":"Point","coordinates":[2.35,48.85]}"""
    private val zone = """{"kind":"GENERIC","geometry":$polygon,"name":"Zone rouge","style":{"color":"#ff0000"}}"""

    @BeforeEach
    fun createMission() {
        val result =
            mvc
                .post("/api/missions") {
                    with(planner())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"name":"Op Nord"}"""
                }.andReturn()
        missionId = JsonPath.read(result.response.contentAsString, "$.id")
    }

    private fun features() = "/api/missions/$missionId/features"

    private fun post(
        body: String,
        who: RequestPostProcessor = planner(),
    ) = mvc.post(features()) {
        with(who)
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun create(
        body: String = zone,
        who: RequestPostProcessor = planner(),
    ): String {
        val result = post(body, who).andExpect { status { isCreated() } }.andReturn()
        return JsonPath.read(result.response.contentAsString, "$.id")
    }

    private fun setMissionStatus(status: String) {
        jdbc
            .sql("UPDATE mission SET status = :s WHERE id = CAST(:id AS uuid)")
            .param("s", status)
            .param("id", missionId)
            .update()
    }

    @Test
    fun `a human creates a generic zone`() {
        post(zone).andExpect {
            status { isCreated() }
            jsonPath("$.origin") { value("HUMAN") }
            jsonPath("$.bbox.maxLat") { value(49.0) }
        }
    }

    @Test
    fun `an agent creates a pending suggestion`() {
        post(zone, agent()).andExpect {
            status { isCreated() }
            jsonPath("$.origin") { value("AI_SUGGESTED") }
            jsonPath("$.suggestionStatus") { value("PENDING") }
        }
    }

    @Test
    fun `an APP-6 symbol needs a 20 digit SIDC`() {
        post("""{"kind":"APP6","geometry":$point}""").andExpect { status { isBadRequest() } }
        post("""{"kind":"APP6","geometry":$point,"sidc":"1003"}""").andExpect { status { isBadRequest() } }
        post("""{"kind":"APP6","geometry":$point,"sidc":"10031000001211000000","modifiers":{"T":"1ER RI"}}""")
            .andExpect { status { isCreated() } }
    }

    @Test
    fun `a generic object cannot carry a SIDC`() {
        post("""{"kind":"GENERIC","geometry":$point,"sidc":"10031000001211000000"}""").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `invalid geometry is rejected and nothing is stored`() {
        val open = """{"kind":"GENERIC","geometry":{"type":"Polygon","coordinates":[[[2.0,48.0],[3.0,48.0],[3.0,49.0],[2.0,49.0]]]}}"""
        post(open).andExpect {
            status { isBadRequest() }
            jsonPath("$.detail") { value("a polygon ring must be closed") }
        }
        mvc.get(features()) { with(planner()) }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `a circle radius only applies to a point`() {
        post("""{"kind":"GENERIC","geometry":$polygon,"style":{"radiusMeters":500}}""").andExpect { status { isBadRequest() } }
        post("""{"kind":"GENERIC","geometry":$point,"style":{"radiusMeters":0}}""").andExpect { status { isBadRequest() } }
        post("""{"kind":"GENERIC","geometry":$point,"style":{"radiusMeters":500}}""").andExpect { status { isCreated() } }
    }

    @Test
    fun `a human accepts a suggestion`() {
        val id = create(who = agent())
        mvc.post("${features()}/$id/accept") { with(planner()) }.andExpect {
            status { isOk() }
            jsonPath("$.suggestionStatus") { value("ACCEPTED") }
        }
    }

    @Test
    fun `a human rejects a suggestion`() {
        val id = create(who = agent())
        mvc.post("${features()}/$id/reject") { with(planner()) }.andExpect { jsonPath("$.suggestionStatus") { value("REJECTED") } }
    }

    @Test
    fun `an agent cannot accept a suggestion`() {
        val id = create(who = agent())
        mvc.post("${features()}/$id/accept") { with(agent()) }.andExpect { status { isForbidden() } }
        mvc.post("${features()}/$id/reject") { with(agent()) }.andExpect { status { isForbidden() } }
        mvc.get(features()) { with(planner()) }.andExpect { jsonPath("$[0].suggestionStatus") { value("PENDING") } }
    }

    @Test
    fun `a human feature cannot be accepted`() {
        val id = create()
        mvc.post("${features()}/$id/accept") { with(planner()) }.andExpect { status { isConflict() } }
    }

    @Test
    fun `an agent cannot modify a human feature`() {
        val id = create()
        mvc
            .put("${features()}/$id") {
                with(agent())
                contentType = MediaType.APPLICATION_JSON
                content = zone
            }.andExpect { status { isForbidden() } }
        mvc.delete("${features()}/$id") { with(agent()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `a human updates a feature`() {
        val id = create()
        mvc
            .put("${features()}/$id") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"kind":"GENERIC","geometry":$point,"name":"PC"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.name") { value("PC") }
                jsonPath("$.bbox.minLon") { value(2.35) }
            }
    }

    @Test
    fun `deletes a feature`() {
        val id = create()
        mvc.delete("${features()}/$id") { with(planner()) }.andExpect { status { isNoContent() } }
        mvc.get(features()) { with(planner()) }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `an unknown mission or feature is not found`() {
        mvc
            .get("/api/missions/00000000-0000-0000-0000-000000000000/features") { with(planner()) }
            .andExpect { status { isNotFound() } }
        mvc
            .post("${features()}/00000000-0000-0000-0000-000000000000/accept") { with(planner()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `a withdrawn mission accepts no new object`() {
        setMissionStatus("WITHDRAWN")
        post(zone).andExpect { status { isConflict() } }
        mvc.get("/api/missions/$missionId") { with(planner()) }.andExpect { jsonPath("$.status") { value("WITHDRAWN") } }
    }

    @Test
    fun `adding an object sends a published mission back to draft`() {
        setMissionStatus("PUBLISHED")
        create()
        mvc.get("/api/missions/$missionId") { with(planner()) }.andExpect { jsonPath("$.status") { value("DRAFT") } }
    }

    private val flotLine = """{"type":"LineString","coordinates":[[2.0,48.0],[2.5,48.2],[3.0,48.1]]}"""

    @Test
    fun `places APP-6D graphics with their own geometry`() {
        post("""{"kind":"APP6","geometry":$flotLine,"sidc":"10032500001401000000"}""").andExpect { status { isCreated() } }
        post("""{"kind":"APP6","geometry":$polygon,"sidc":"10032500001512000000","modifiers":{"T":"BP1"}}""")
            .andExpect { status { isCreated() } }
    }

    @Test
    fun `rejects an APP-6D symbol drawn with the wrong geometry`() {
        post("""{"kind":"APP6","geometry":$point,"sidc":"10032500001401000000"}""").andExpect {
            status { isBadRequest() }
            jsonPath("$.detail") { value("Forward Line of Troops must be drawn as a LineString") }
        }
        post("""{"kind":"APP6","geometry":$polygon,"sidc":"10031000001211000000"}""").andExpect { status { isBadRequest() } }
        mvc.get(features()) { with(planner()) }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `rejects an unknown or non APP-6D symbol`() {
        post("""{"kind":"APP6","geometry":$point,"sidc":"99999999999999999999"}""").andExpect { status { isBadRequest() } }
        post("""{"kind":"APP6","geometry":$point,"sidc":"11031000001211000000"}""").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `rejects a modifier that does not apply to the symbol`() {
        post("""{"kind":"APP6","geometry":$point,"sidc":"10031000001211000000","modifiers":{"ZZ":"x"}}""")
            .andExpect { status { isBadRequest() } }
    }
}
