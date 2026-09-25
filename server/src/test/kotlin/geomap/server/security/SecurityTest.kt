package geomap.server.security

import geomap.server.IntegrationTest
import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.get

class SecurityTest : IntegrationTest() {
    @Test
    fun `health stays public`() {
        mvc.get("/actuator/health").andExpect { status { isOk() } }
    }

    @Test
    fun `any other route needs a token`() {
        mvc.get("/api/missions").andExpect { status { isUnauthorized() } }
    }
}
