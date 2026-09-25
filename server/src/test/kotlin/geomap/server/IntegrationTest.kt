package geomap.server

import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration::class)
abstract class IntegrationTest {
    @Autowired
    private lateinit var context: WebApplicationContext

    protected lateinit var mvc: MockMvc

    @BeforeEach
    fun setUpMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build()
    }
}
