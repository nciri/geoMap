package geomap.server.audit

import geomap.server.IntegrationTest
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.get
import java.time.Instant

class AuditApiTest : IntegrationTest() {
    @Autowired
    private lateinit var audit: AuditRepository

    @Test
    fun `an administrator reads the latest events first`() {
        audit.record(AuditEvent(Instant.now(), "alice", null, "mission.create", "mission:1", emptyMap()))
        audit.record(AuditEvent(Instant.now(), "alice", "assistant", "feature.create", "feature:2", emptyMap()))
        mvc.get("/api/audit?limit=1") { with(admin()) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].action") { value("feature.create") }
            jsonPath("$[0].actorAgent") { value("assistant") }
        }
    }

    @Test
    fun `a planner cannot read the audit trail`() {
        mvc.get("/api/audit") { with(planner()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `rejects a limit out of range`() {
        mvc.get("/api/audit?limit=0") { with(admin()) }.andExpect { status { isBadRequest() } }
        mvc.get("/api/audit?limit=1001") { with(admin()) }.andExpect { status { isBadRequest() } }
    }
}
