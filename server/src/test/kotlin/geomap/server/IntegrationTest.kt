package geomap.server

import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration::class)
abstract class IntegrationTest {
    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    protected lateinit var jdbc: JdbcClient

    protected lateinit var mvc: MockMvc

    @BeforeEach
    fun setUpMvc() {
        jdbc.sql("TRUNCATE audit_event, feature, mission, basemap").update()
        mvc =
            MockMvcBuilders
                .webAppContextSetup(context)
                .apply<DefaultMockMvcBuilder>(springSecurity())
                .build()
    }

    protected fun planner(user: String = "alice"): RequestPostProcessor =
        jwt().jwt { it.subject(user) }.authorities(SimpleGrantedAuthority("ROLE_planificateur"))

    protected fun agent(user: String = "alice"): RequestPostProcessor =
        jwt()
            .jwt { it.subject(user).claim("act", mapOf("sub" to "assistant")) }
            .authorities(SimpleGrantedAuthority("ROLE_planificateur"))

    protected fun admin(): RequestPostProcessor =
        jwt().jwt { it.subject("root") }.authorities(SimpleGrantedAuthority("ROLE_administrateur"))
}
