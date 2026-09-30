package geomap.server.mission

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import geomap.server.audit.AuditRepository
import geomap.server.basemap.Basemap
import geomap.server.basemap.BasemapRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.time.Instant
import kotlin.test.assertEquals

class MissionApiTest : IntegrationTest() {
    @Autowired
    private lateinit var audit: AuditRepository

    @Autowired
    private lateinit var basemaps: BasemapRepository

    private fun create(
        body: String = """{"name":"Op Nord"}""",
        who: RequestPostProcessor = planner(),
    ): String {
        val result =
            mvc
                .post("/api/missions") {
                    with(who)
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andExpect { status { isCreated() } }
                .andReturn()
        return JsonPath.read(result.response.contentAsString, "$.id")
    }

    private fun setStatus(
        id: String,
        status: String,
    ) {
        jdbc
            .sql("UPDATE mission SET status = :s WHERE id = CAST(:id AS uuid)")
            .param("s", status)
            .param("id", id)
            .update()
    }

    @Test
    fun `creates a draft mission owned by the caller`() {
        basemaps.insert(Basemap("zone-nord", "Zone Nord", 1, "basemaps/zone-nord/x.pmtiles", "b".repeat(64), "c2ln", "root", Instant.now()))
        mvc
            .post("/api/missions") {
                with(planner("bob"))
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op Nord","layers":["zone-nord"],"validUntil":"2099-01-01T00:00:00Z"}"""
            }.andExpect {
                status { isCreated() }
                jsonPath("$.status") { value("DRAFT") }
                jsonPath("$.name") { value("Op Nord") }
                jsonPath("$.layers[0]") { value("zone-nord") }
                jsonPath("$.createdBy") { value("bob") }
            }
    }

    @Test
    fun `rejects a blank name`() {
        mvc
            .post("/api/missions") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"   "}"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `rejects an expiry in the past`() {
        mvc
            .post("/api/missions") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op","validUntil":"2000-01-01T00:00:00Z"}"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `rejects an invalid basemap id`() {
        mvc
            .post("/api/missions") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op","layers":["../etc"]}"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `rejects malformed json`() {
        mvc
            .post("/api/missions") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"""
            }.andExpect {
                status { isBadRequest() }
                content { contentType(MediaType.APPLICATION_PROBLEM_JSON) }
                jsonPath("$.status") { value(400) }
            }
    }

    @Test
    fun `a malformed path id is a problem detail`() {
        mvc.get("/api/missions/not-a-uuid") { with(planner()) }.andExpect {
            status { isBadRequest() }
            content { contentType(MediaType.APPLICATION_PROBLEM_JSON) }
        }
    }

    @Test
    fun `lists and reads missions`() {
        val id = create()
        mvc.get("/api/missions") { with(planner()) }.andExpect { jsonPath("$[0].id") { value(id) } }
        mvc.get("/api/missions/$id") { with(planner()) }.andExpect { jsonPath("$.name") { value("Op Nord") } }
    }

    @Test
    fun `an unknown mission is not found`() {
        mvc.get("/api/missions/00000000-0000-0000-0000-000000000000") { with(planner()) }.andExpect {
            status { isNotFound() }
            jsonPath("$.detail") { value("mission not found") }
        }
    }

    @Test
    fun `updates a mission and records the changed fields`() {
        val id = create()
        mvc
            .patch("/api/missions/$id") {
                with(planner("bob"))
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op Sud"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.name") { value("Op Sud") }
                jsonPath("$.updatedBy") { value("bob") }
            }
        val event = audit.latest(1).single()
        assertEquals("mission.update", event.action)
        assertEquals("mission:$id", event.target)
        assertEquals(mapOf("fields" to listOf("name")), event.details)
    }

    @Test
    fun `editing a published mission sends it back to draft`() {
        val id = create()
        setStatus(id, "PUBLISHED")
        mvc
            .patch("/api/missions/$id") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op Nord 2"}"""
            }.andExpect { jsonPath("$.status") { value("DRAFT") } }
    }

    @Test
    fun `a withdrawn mission cannot be edited`() {
        val id = create()
        setStatus(id, "WITHDRAWN")
        mvc
            .patch("/api/missions/$id") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op"}"""
            }.andExpect { status { isConflict() } }
        mvc.get("/api/missions/$id") { with(planner()) }.andExpect { jsonPath("$.status") { value("WITHDRAWN") } }
    }

    @Test
    fun `deletes a draft mission`() {
        val id = create()
        mvc.delete("/api/missions/$id") { with(planner()) }.andExpect { status { isNoContent() } }
        mvc.get("/api/missions/$id") { with(planner()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `a published mission cannot be deleted`() {
        val id = create()
        setStatus(id, "PUBLISHED")
        mvc.delete("/api/missions/$id") { with(planner()) }.andExpect { status { isConflict() } }
    }

    @Test
    fun `an agent cannot change a mission`() {
        val id = create()
        setStatus(id, "PUBLISHED")
        mvc
            .patch("/api/missions/$id") {
                with(agent())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op IA"}"""
            }.andExpect { status { isForbidden() } }
        mvc.get("/api/missions/$id") { with(planner()) }.andExpect {
            jsonPath("$.name") { value("Op Nord") }
            jsonPath("$.status") { value("PUBLISHED") }
        }
    }

    @Test
    fun `an agent cannot delete a mission`() {
        val id = create()
        mvc.delete("/api/missions/$id") { with(agent()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `an agent-created mission is audited with the agent`() {
        create(who = agent())
        val event = audit.latest(1).single()
        assertEquals("alice", event.actorUser)
        assertEquals("assistant", event.actorAgent)
    }

    @Test
    fun `an administrator without the planner role is forbidden`() {
        mvc.get("/api/missions") { with(admin()) }.andExpect { status { isForbidden() } }
    }
}
