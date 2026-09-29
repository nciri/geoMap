package geomap.server

import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.get
import kotlin.test.assertTrue

class OperationsTest : IntegrationTest() {
    @Test
    fun `exposes Prometheus metrics without a token`() {
        val body =
            mvc
                .get("/actuator/prometheus")
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertTrue(body.contains("jvm_memory_used_bytes"))
    }

    @Test
    fun `describes the API in OpenAPI for authenticated callers`() {
        mvc.get("/v3/api-docs").andExpect { status { isUnauthorized() } }
        val body =
            mvc
                .get("/v3/api-docs") { with(planner()) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertTrue(body.contains("/api/missions/{missionId}/features/{featureId}/accept"))
    }
}
