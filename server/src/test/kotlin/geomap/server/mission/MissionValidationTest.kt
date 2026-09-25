package geomap.server.mission

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import geomap.server.basemap.Basemap
import geomap.server.basemap.BasemapRepository
import org.hamcrest.Matchers.containsInAnyOrder
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.time.Instant
import java.util.UUID

class MissionValidationTest : IntegrationTest() {
    @Autowired
    private lateinit var features: FeatureRepository

    @Autowired
    private lateinit var basemaps: BasemapRepository

    private lateinit var missionId: String

    private val infantry = """{"kind":"APP6","geometry":{"type":"Point","coordinates":[2.35,48.85]},"sidc":"10031000001211000000"}"""
    private val flot =
        """{"kind":"APP6","geometry":{"type":"LineString","coordinates":[[2.0,48.0],[3.0,48.1]]},"sidc":"10032500001401000000"}"""

    private fun createMission(body: String): String {
        val result =
            mvc
                .post("/api/missions") {
                    with(planner())
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andReturn()
        return JsonPath.read(result.response.contentAsString, "$.id")
    }

    @BeforeEach
    fun createCompleteMission() {
        basemaps.insert(
            Basemap("zone-nord", "Zone Nord", 1, "basemaps/zone-nord/seed.pmtiles", "0".repeat(64), "c2ln", "root", Instant.now()),
        )
        missionId = createMission("""{"name":"Op Nord","basemapId":"zone-nord","validUntil":"2099-01-01T00:00:00Z"}""")
    }

    private fun add(
        body: String,
        who: RequestPostProcessor = planner(),
    ) {
        mvc
            .post("/api/missions/$missionId/features") {
                with(who)
                contentType = MediaType.APPLICATION_JSON
                content = body
            }.andExpect { status { isCreated() } }
    }

    private fun validation() = mvc.get("/api/missions/$missionId/validation") { with(planner()) }

    @Test
    fun `a complete mission is publishable`() {
        add(infantry)
        add(flot)
        validation().andExpect {
            status { isOk() }
            jsonPath("$.publishable") { value(true) }
            jsonPath("$.errors.length()") { value(0) }
            jsonPath("$.warnings.length()") { value(0) }
        }
    }

    @Test
    fun `a mission without basemap nor expiry is not publishable`() {
        missionId = createMission("""{"name":"Op Vide"}""")
        validation().andExpect {
            jsonPath("$.publishable") { value(false) }
            jsonPath("$.errors[*].code") { value(containsInAnyOrder("NO_BASEMAP", "NO_EXPIRY")) }
            jsonPath("$.warnings[0].code") { value("EMPTY_MISSION") }
        }
    }

    @Test
    fun `an expired mission is not publishable`() {
        add(infantry)
        jdbc
            .sql("UPDATE mission SET valid_until = now() - interval '1 day' WHERE id = CAST(:id AS uuid)")
            .param("id", missionId)
            .update()
        validation().andExpect { jsonPath("$.errors[0].code") { value("EXPIRED") } }
    }

    @Test
    fun `pending suggestions are a warning, not an error`() {
        add(infantry)
        add(flot, agent())
        validation().andExpect {
            jsonPath("$.publishable") { value(true) }
            jsonPath("$.warnings[0].code") { value("PENDING_SUGGESTIONS") }
        }
    }

    @Test
    fun `a stored object that no longer renders is reported with its id`() {
        add(infantry)
        val now = Instant.now()
        val broken =
            Feature(
                id = UUID.randomUUID(),
                missionId = UUID.fromString(missionId),
                kind = FeatureKind.APP6,
                geometry = mapOf("type" to "Point", "coordinates" to listOf(2.0, 48.0)),
                bbox = BBox(2.0, 48.0, 2.0, 48.0),
                name = "",
                description = "",
                style = null,
                sidc = "10991099991211009999",
                modifiers = null,
                origin = FeatureOrigin.HUMAN,
                suggestionStatus = null,
                createdAt = now,
                updatedAt = now,
            )
        features.insert(broken)
        validation().andExpect {
            status { isOk() }
            jsonPath("$.publishable") { value(false) }
            jsonPath("$.errors[0].code") { value("SYMBOL_NOT_RENDERABLE") }
            jsonPath("$.errors[0].featureId") { value(broken.id.toString()) }
        }
    }

    @Test
    fun `an unknown mission is not found`() {
        mvc
            .get("/api/missions/00000000-0000-0000-0000-000000000000/validation") { with(planner()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `a mission on an unregistered basemap is not publishable`() {
        missionId = createMission("""{"name":"Op Sud","basemapId":"zone-sud","validUntil":"2099-01-01T00:00:00Z"}""")
        add(infantry)
        validation().andExpect {
            jsonPath("$.publishable") { value(false) }
            jsonPath("$.errors[0].code") { value("UNKNOWN_BASEMAP") }
        }
    }
}
