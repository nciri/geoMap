package geomap.server.publication

import geomap.pkg.MissionPayload
import geomap.pkg.Sha256
import geomap.pkg.ZoomBand
import geomap.server.mission.Feature
import geomap.server.mission.FeatureKind
import geomap.server.mission.GeoJsonGeometry
import geomap.server.symbology.RenderBand
import geomap.server.symbology.SymbolCatalog
import geomap.server.symbology.SymbolGeometry
import geomap.server.symbology.SymbolRenderer
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

@Component
class PayloadBuilder(
    private val catalog: SymbolCatalog,
    private val renderer: SymbolRenderer,
    private val json: ObjectMapper,
) {
    fun build(
        missionName: String,
        features: List<Feature>,
    ): MissionPayload {
        val icons = mutableMapOf<String, ByteArray>()
        val bands =
            ZoomBand.entries.associateWith { band ->
                val rendered = features.flatMap { render(it, RenderBand.valueOf(band.name), icons) }
                json.writeValueAsString(mapOf("type" to "FeatureCollection", "features" to rendered))
            }
        return MissionPayload(bands, icons, "# $missionName\n")
    }

    @Suppress("UNCHECKED_CAST")
    private fun render(
        feature: Feature,
        band: RenderBand,
        icons: MutableMap<String, ByteArray>,
    ): List<Map<String, Any?>> {
        val common = mapOf("featureId" to "${feature.id}", "name" to feature.name, "description" to feature.description)
        if (feature.kind == FeatureKind.GENERIC) {
            return listOf(geoJson(feature.geometry, common + mapOf("kind" to "generic", "style" to feature.style)))
        }
        val sidc = feature.sidc!!
        val modifiers = feature.modifiers.orEmpty()
        val symbol = catalog.validate(sidc, feature.geometry, feature.modifiers)
        if (symbol.geometry == SymbolGeometry.POINT) {
            val icon = renderer.icon(sidc, modifiers, ICON_SIZE)
            // Content-addressed name: identical symbols share one PNG in the package.
            val name = Sha256.hex(icon.png) + ".png"
            icons[name] = icon.png
            return listOf(
                geoJson(
                    feature.geometry,
                    common + mapOf("kind" to "symbol", "icon" to name, "anchorX" to icon.anchorX, "anchorY" to icon.anchorY),
                ),
            )
        }
        val graphic = renderer.graphic(sidc, GeoJsonGeometry.controlPoints(feature.geometry), modifiers, band)
        return (graphic["features"] as List<Map<String, Any?>>).map { rendered ->
            rendered + ("properties" to ((rendered["properties"] as Map<String, Any?>) + ("featureId" to "${feature.id}")))
        }
    }

    private fun geoJson(
        geometry: Map<String, Any?>,
        properties: Map<String, Any?>,
    ) = mapOf("type" to "Feature", "geometry" to geometry, "properties" to properties)

    private companion object {
        const val ICON_SIZE = 64
    }
}
