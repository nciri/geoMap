package geomap.server.symbology

import armyc2.c5isr.renderer.utilities.MSInfo
import armyc2.c5isr.renderer.utilities.MSLookup
import armyc2.c5isr.renderer.utilities.Modifiers
import armyc2.c5isr.renderer.utilities.SymbolID
import org.springframework.stereotype.Component

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

    private fun MSInfo.toSymbolInfo(): SymbolInfo? {
        val kind =
            when (geometry.lowercase()) {
                "point" -> SymbolGeometry.POINT
                "line" -> SymbolGeometry.LINE
                "area" -> SymbolGeometry.AREA
                else -> return null
            }
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
    }
}
