package geomap.server.symbology

import armyc2.c5isr.renderer.utilities.MSInfo
import armyc2.c5isr.renderer.utilities.MSLookup
import armyc2.c5isr.renderer.utilities.Modifiers
import armyc2.c5isr.renderer.utilities.SymbolID
import geomap.server.mission.GeoJsonGeometry
import geomap.server.web.InvalidInputException
import org.springframework.stereotype.Component
import kotlin.math.min

enum class SymbolGeometry { POINT, LINE, AREA }

data class SymbolInfo(
    val basicId: String,
    val name: String,
    val path: String,
    val geometry: SymbolGeometry,
    val minPoints: Int,
    val maxPoints: Int,
    val modifiers: Set<String>,
)

@Component
class SymbolCatalog {
    private val lookup = MSLookup.getInstance()

    private val entries: List<SymbolInfo> by lazy {
        lookup.getIDList(SymbolID.Version_APP6D).mapNotNull { lookup.getMSLInfo(it, SymbolID.Version_APP6D)?.toSymbolInfo() }
    }

    fun describe(sidc: String): SymbolInfo? {
        if (!APP6D_SIDC.matches(sidc)) return null
        return lookup.getMSLInfo(sidc)?.toSymbolInfo()
    }

    fun search(
        query: String,
        limit: Int,
    ): List<SymbolInfo> {
        val words = query.lowercase().split(' ').filter { it.isNotBlank() }
        return entries
            .asSequence()
            .filter { entry -> "${entry.path} ${entry.name}".lowercase().let { text -> words.all { it in text } } }
            .take(limit)
            .toList()
    }

    fun validate(
        sidc: String?,
        geometry: Map<String, Any?>,
        modifiers: Map<String, String>?,
    ): SymbolInfo {
        if (sidc == null) invalid("an APP-6D symbol needs a SIDC")
        val symbol = describe(sidc) ?: invalid("unknown APP-6D symbol: $sidc")
        val expected =
            when (symbol.geometry) {
                SymbolGeometry.POINT -> "Point"
                SymbolGeometry.LINE -> "LineString"
                SymbolGeometry.AREA -> "Polygon"
            }
        if (geometry["type"] != expected) invalid("${symbol.name} must be drawn as a $expected")
        val points = GeoJsonGeometry.controlPoints(geometry).size
        val effectiveMax = min(symbol.maxPoints, MAX_CONTROL_POINTS)
        if (points !in symbol.minPoints..effectiveMax) invalid("${symbol.name} needs ${symbol.minPoints} to $effectiveMax points")
        modifiers?.keys?.firstOrNull { it !in symbol.modifiers }?.let { invalid("modifier $it does not apply to ${symbol.name}") }
        return symbol
    }

    private fun invalid(message: String): Nothing = throw InvalidInputException(message)

    private fun MSInfo.toSymbolInfo(): SymbolInfo? {
        val kind =
            when (geometry.lowercase()) {
                "point" -> SymbolGeometry.POINT
                "line" -> SymbolGeometry.LINE
                "area" -> SymbolGeometry.AREA
                else -> return null
            }
        // Category headers (0..0 points) and undersized Area symbols (e.g. Circle, Rectangle) can never satisfy a GeoJSON shape.
        val placeable =
            when (kind) {
                SymbolGeometry.POINT -> 1 in minPointCount..maxPointCount
                SymbolGeometry.LINE -> maxPointCount >= 2
                SymbolGeometry.AREA -> maxPointCount >= 3
            }
        if (!placeable) return null
        return SymbolInfo(
            basicId = basicSymbolID,
            name = name,
            path = path.trim().trimEnd('/').trim(),
            geometry = kind,
            minPoints = minPointCount,
            maxPoints = maxPointCount,
            // mil-sym-java's ArrayList<String> modifiers can contain null slots; skip them.
            modifiers = modifiers.filterNotNull().mapNotNull { Modifiers.getModifierLetterCode(it) }.toSet(),
        )
    }

    companion object {
        val APP6D_SIDC = Regex("^10\\d{18}$")

        // Bounds time spent holding SymbolRenderer's global render lock; a 20 000-point FLOT would hold it ~1.2s.
        const val MAX_CONTROL_POINTS = 2000
    }
}
