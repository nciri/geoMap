package geomap.server.mission

import geomap.server.web.InvalidInputException

data class BBox(
    val minLon: Double,
    val minLat: Double,
    val maxLon: Double,
    val maxLat: Double,
)

object GeoJsonGeometry {
    fun validate(geometry: Map<String, Any?>): BBox {
        val coordinates = geometry["coordinates"]
        val positions =
            when (val type = geometry["type"]) {
                "Point" -> listOf(position(coordinates))
                "LineString" -> positions(coordinates, minSize = 2)
                "Polygon" -> polygon(coordinates)
                else -> invalid("unsupported geometry type: $type")
            }
        return BBox(
            minLon = positions.minOf { it.first },
            minLat = positions.minOf { it.second },
            maxLon = positions.maxOf { it.first },
            maxLat = positions.maxOf { it.second },
        )
    }

    private fun position(value: Any?): Pair<Double, Double> {
        val list = value as? List<*> ?: invalid("a position must be an array")
        if (list.size !in 2..3) invalid("a position must have 2 or 3 numbers")
        val numbers = list.map { (it as? Number)?.toDouble() ?: invalid("a position must contain numbers") }
        val lon = numbers[0]
        val lat = numbers[1]
        if (lon !in -180.0..180.0 || lat !in -90.0..90.0) invalid("position out of range: $lon, $lat")
        return lon to lat
    }

    private fun positions(
        value: Any?,
        minSize: Int,
    ): List<Pair<Double, Double>> {
        val list = value as? List<*> ?: invalid("coordinates must be an array")
        if (list.size < minSize) invalid("at least $minSize positions are required")
        return list.map(::position)
    }

    private fun polygon(value: Any?): List<Pair<Double, Double>> {
        val rings = value as? List<*> ?: invalid("coordinates must be an array")
        if (rings.isEmpty()) invalid("a polygon needs an outer ring")
        return rings.flatMap { ring ->
            val ringPositions = positions(ring, minSize = 4)
            if (ringPositions.first() != ringPositions.last()) invalid("a polygon ring must be closed")
            ringPositions
        }
    }

    private fun invalid(message: String): Nothing = throw InvalidInputException(message)

    fun controlPoints(geometry: Map<String, Any?>): List<Pair<Double, Double>> {
        val coordinates = geometry["coordinates"]
        return when (geometry["type"]) {
            "Point" -> listOf(position(coordinates))
            "LineString" -> positions(coordinates, minSize = 2)
            "Polygon" -> {
                val rings = coordinates as? List<*> ?: invalid("coordinates must be an array")
                positions(rings.firstOrNull(), minSize = 4).dropLast(1)
            }
            else -> invalid("unsupported geometry type: ${geometry["type"]}")
        }
    }
}
