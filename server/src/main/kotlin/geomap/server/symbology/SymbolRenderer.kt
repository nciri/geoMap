package geomap.server.symbology

import armyc2.c5isr.renderer.MilStdIconRenderer
import armyc2.c5isr.renderer.utilities.MilStdAttributes
import armyc2.c5isr.renderer.utilities.Modifiers
import armyc2.c5isr.web.render.WebRenderer
import geomap.server.web.InvalidInputException
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

enum class RenderBand(
    val scale: Double,
) {
    LOW(2_000_000.0),
    MID(150_000.0),
    HIGH(10_000.0),
    ;

    companion object {
        fun forZoom(zoom: Int): RenderBand =
            when (zoom) {
                in 0..10 -> LOW
                in 11..14 -> MID
                in 15..22 -> HIGH
                else -> throw InvalidInputException("zoom must be between 0 and 22")
            }
    }
}

class RenderedIcon(
    val png: ByteArray,
    val width: Int,
    val height: Int,
    val anchorX: Int,
    val anchorY: Int,
)

@Component
class SymbolRenderer(
    private val json: ObjectMapper,
) {
    // ponytail: mil-sym keeps static renderer state, so one global lock; use a pool of isolated renderers if throughput matters.
    private val lock = Any()

    fun icon(
        sidc: String,
        modifiers: Map<String, String>,
        pixelSize: Int,
    ): RenderedIcon {
        val keys = milSymModifiers(modifiers)
        val info =
            synchronized(lock) {
                val renderer = MilStdIconRenderer.getInstance()
                if (!renderer.CanRender(sidc, HashMap(keys))) throw InvalidInputException("cannot render symbol $sidc")
                renderer.RenderIcon(sidc, keys, mapOf(MilStdAttributes.PixelSize to "$pixelSize"))
            } ?: throw InvalidInputException("cannot render symbol $sidc")
        return RenderedIcon(info.imageAsByteArray, info.image.width, info.image.height, info.symbolCenterX, info.symbolCenterY)
    }

    @Suppress("UNCHECKED_CAST")
    fun graphic(
        sidc: String,
        controlPoints: List<Pair<Double, Double>>,
        modifiers: Map<String, String>,
        band: RenderBand,
    ): Map<String, Any?> {
        val keys = milSymModifiers(modifiers)
        val points = controlPoints.joinToString(" ") { (lon, lat) -> "$lon,$lat" }
        val output =
            synchronized(lock) {
                WebRenderer.RenderSymbol(
                    "geomap",
                    "",
                    "",
                    sidc,
                    points,
                    "clampToGround",
                    band.scale,
                    clipBox(controlPoints),
                    HashMap(keys),
                    HashMap(),
                    WebRenderer.OUTPUT_FORMAT_GEOJSON,
                )
            }
        val collection = json.readValue(output, Map::class.java) as Map<String, Any?>
        if (collection["type"] == "error") throw InvalidInputException("cannot render symbol $sidc")
        // mil-sym appends a feature carrying only metadata (empty polygon, symbolID…): not something to draw.
        val drawable =
            (collection["features"] as List<Map<String, Any?>>).filterNot {
                "symbolID" in (it["properties"] as Map<String, Any?>)
            }
        return mapOf("type" to "FeatureCollection", "features" to drawable)
    }

    private fun milSymModifiers(modifiers: Map<String, String>): Map<String, String> =
        modifiers.entries.associate { (letter, value) ->
            (Modifiers.getModifierKey(letter) ?: throw InvalidInputException("unknown modifier: $letter")) to value
        }

    // The clip box must contain the whole graphic: pad the control points' extent generously.
    private fun clipBox(points: List<Pair<Double, Double>>): String {
        val minLon = points.minOf { it.first }
        val maxLon = points.maxOf { it.first }
        val minLat = points.minOf { it.second }
        val maxLat = points.maxOf { it.second }
        val pad = maxOf(maxLon - minLon, maxLat - minLat, 0.01)
        return "${(minLon - pad).coerceAtLeast(-180.0)},${(minLat - pad).coerceAtLeast(-90.0)}," +
            "${(maxLon + pad).coerceAtMost(180.0)},${(maxLat + pad).coerceAtMost(90.0)}"
    }
}
