package geomap.server.symbology

import geomap.server.IntegrationTest
import org.hamcrest.Matchers.greaterThan
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

class SymbolApiTest : IntegrationTest() {
    private val flotLine = """{"type":"LineString","coordinates":[[2.0,48.0],[2.5,48.2],[3.0,48.1]]}"""

    @Test
    fun `searches the catalogue`() {
        mvc.get("/api/symbols?q=infantry&limit=3") { with(planner()) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(3) }
            jsonPath("$[0].geometry") { exists() }
        }
    }

    @Test
    fun `rejects a search limit out of range`() {
        mvc.get("/api/symbols?limit=0") { with(planner()) }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `serves a point symbol icon`() {
        mvc.get("/api/symbols/10031000001211000000/icon.png?size=48&T=1ER%20RI") { with(planner()) }.andExpect {
            status { isOk() }
            content { contentType(MediaType.IMAGE_PNG) }
            header { exists("X-Anchor-X") }
            header { string("Cache-Control", "max-age=86400") }
        }
    }

    @Test
    fun `refuses an icon for an unknown symbol, a graphic or an unknown parameter`() {
        mvc.get("/api/symbols/99999999999999999999/icon.png") { with(planner()) }.andExpect { status { isBadRequest() } }
        mvc.get("/api/symbols/10032500001401000000/icon.png") { with(planner()) }.andExpect { status { isBadRequest() } }
        mvc.get("/api/symbols/10031000001211000000/icon.png?colour=red") { with(planner()) }.andExpect { status { isBadRequest() } }
        mvc.get("/api/symbols/10031000001211000000/icon.png?size=2000") { with(planner()) }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `previews a tactical graphic at a zoom level`() {
        mvc
            .post("/api/symbols/10032500001401000000/graphic") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"geometry":$flotLine,"zoom":12}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.type") { value("FeatureCollection") }
                jsonPath("$.features.length()") { value(greaterThan(0)) }
            }
    }

    @Test
    fun `refuses a preview with the wrong geometry or zoom`() {
        mvc
            .post("/api/symbols/10032500001401000000/graphic") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"geometry":{"type":"Point","coordinates":[2.0,48.0]},"zoom":12}"""
            }.andExpect { status { isBadRequest() } }
        mvc
            .post("/api/symbols/10032500001401000000/graphic") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"geometry":$flotLine,"zoom":30}"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `describes a symbol from its full SIDC`() {
        mvc.get("/api/symbols/10031000161211000000") { with(planner()) }.andExpect {
            status { isOk() }
            jsonPath("$.basicId") { value("10121100") }
            jsonPath("$.name") { value("Infantry") }
            jsonPath("$.geometry") { value("POINT") }
        }
    }

    @Test
    fun `an unknown SIDC is not found`() {
        mvc.get("/api/symbols/10039999999999990000") { with(planner()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `needs the planner role`() {
        mvc.get("/api/symbols") { with(admin()) }.andExpect { status { isForbidden() } }
        mvc.get("/api/symbols").andExpect { status { isUnauthorized() } }
    }
}
