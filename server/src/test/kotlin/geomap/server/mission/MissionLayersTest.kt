package geomap.server.mission

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import geomap.server.TestPmtiles
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

class MissionLayersTest : IntegrationTest() {
    @BeforeEach
    fun basemaps() {
        upload("zone-nord", TestPmtiles.build(tileType = 1))
        upload("zone-sud", TestPmtiles.build(tileType = 1, seed = 2))
        upload("paris-ortho", TestPmtiles.build(tileType = 3, bounds = BBox(2.2, 48.78, 2.47, 48.94)))
        upload("lyon-ortho", TestPmtiles.build(tileType = 3, bounds = BBox(4.7, 45.7, 4.95, 45.85), seed = 3))
    }

    private fun upload(
        id: String,
        bytes: ByteArray,
    ) = mvc
        .put("/api/basemaps/$id?name=$id") {
            with(admin())
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = bytes
        }.andExpect { status { isCreated() } }

    private fun create(layers: String) =
        mvc.post("/api/missions") {
            with(planner())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Op Nord","layers":$layers}"""
        }

    private fun idOf(layers: String): String = JsonPath.read(create(layers).andReturn().response.contentAsString, "$.id")

    @Test
    fun `a mission stacks a vector basemap and imagery in order`() {
        create("""["zone-nord","paris-ortho","lyon-ortho"]""").andExpect {
            status { isCreated() }
            jsonPath("$.layers[0]") { value("zone-nord") }
            jsonPath("$.layers[2]") { value("lyon-ortho") }
        }
    }

    @Test
    fun `layer rules are enforced`() {
        create("""["paris-ortho","zone-nord"]""").andExpect { status { isBadRequest() } }
        create("""["zone-nord","zone-sud"]""").andExpect { status { isBadRequest() } }
        create("""["zone-nord","paris-ortho","paris-ortho"]""").andExpect { status { isBadRequest() } }
        create("""["zone-nord","nowhere"]""").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `patching layers replaces the list, omitting them keeps it`() {
        val id = idOf("""["zone-nord"]""")
        mvc
            .patch("/api/missions/$id") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"layers":["zone-nord","paris-ortho"]}"""
            }.andExpect { jsonPath("$.layers.length()") { value(2) } }
        mvc
            .patch("/api/missions/$id") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op Nord 2"}"""
            }.andExpect { jsonPath("$.layers[1]") { value("paris-ortho") } }
    }

    @Test
    fun `a mission without a vector basemap cannot publish and far imagery is flagged`() {
        val id = idOf("""["zone-nord","lyon-ortho"]""")
        mvc.post("/api/missions/$id/features") {
            with(planner())
            contentType = MediaType.APPLICATION_JSON
            content = """{"kind":"GENERIC","geometry":{"type":"Point","coordinates":[2.35,48.85]}}"""
        }
        mvc.get("/api/missions/$id/validation") { with(planner()) }.andExpect {
            jsonPath("$.warnings[?(@.code == 'IMAGERY_OUT_OF_AREA')]") { exists() }
        }
        val bare = idOf("[]")
        mvc.get("/api/missions/$bare/validation") { with(planner()) }.andExpect {
            jsonPath("$.errors[?(@.code == 'NO_BASEMAP')]") { exists() }
        }
    }
}
