package geomap.server.symbology

import geomap.server.mission.GeoJsonGeometry
import geomap.server.web.InvalidInputException
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Duration

data class GraphicPreview(
    val geometry: Map<String, Any?>,
    val modifiers: Map<String, String>? = null,
    val zoom: Int,
)

@RestController
@RequestMapping("/api/symbols")
@PreAuthorize("hasRole('planificateur')")
class SymbolController(
    private val catalog: SymbolCatalog,
    private val renderer: SymbolRenderer,
) {
    @GetMapping
    fun search(
        @RequestParam(defaultValue = "") q: String,
        @RequestParam(defaultValue = "20") limit: Int,
    ): List<SymbolInfo> {
        if (limit !in 1..100) throw InvalidInputException("limit must be between 1 and 100")
        return catalog.search(q, limit)
    }

    @GetMapping("/{sidc}/icon.png", produces = [MediaType.IMAGE_PNG_VALUE])
    fun icon(
        @PathVariable sidc: String,
        @RequestParam params: Map<String, String>,
    ): ResponseEntity<ByteArray> {
        val size = params["size"]?.let { it.toIntOrNull() ?: invalidSize() } ?: 64
        if (size !in 16..256) invalidSize()
        val symbol = catalog.describe(sidc) ?: throw InvalidInputException("unknown APP-6D symbol: $sidc")
        if (symbol.geometry != SymbolGeometry.POINT) throw InvalidInputException("${symbol.name} is a graphic, not an icon")
        val modifiers = params - "size"
        modifiers.keys.firstOrNull { it !in symbol.modifiers }?.let { throw InvalidInputException("unknown parameter: $it") }
        val icon = renderer.icon(sidc, modifiers, size)
        return ResponseEntity
            .ok()
            .cacheControl(CacheControl.maxAge(Duration.ofDays(1)))
            .header("X-Anchor-X", "${icon.anchorX}")
            .header("X-Anchor-Y", "${icon.anchorY}")
            .contentType(MediaType.IMAGE_PNG)
            .body(icon.png)
    }

    @PostMapping("/{sidc}/graphic")
    fun graphic(
        @PathVariable sidc: String,
        @RequestBody preview: GraphicPreview,
    ): Map<String, Any?> {
        val band = RenderBand.forZoom(preview.zoom)
        GeoJsonGeometry.validate(preview.geometry)
        val symbol = catalog.validate(sidc, preview.geometry, preview.modifiers)
        if (symbol.geometry == SymbolGeometry.POINT) throw InvalidInputException("${symbol.name} is an icon, not a graphic")
        return renderer.graphic(sidc, GeoJsonGeometry.controlPoints(preview.geometry), preview.modifiers.orEmpty(), band)
    }

    private fun invalidSize(): Nothing = throw InvalidInputException("size must be between 16 and 256")
}
