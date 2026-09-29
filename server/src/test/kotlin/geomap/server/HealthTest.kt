package geomap.server

import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.get

class HealthTest : IntegrationTest() {
    @Test
    fun `health endpoint reports UP`() {
        mvc.get("/actuator/health").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("UP") }
        }
    }
}
