package geomap.server.mission

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.util.UUID

@Repository
class FeatureRepository(
    private val jdbc: JdbcClient,
    private val json: ObjectMapper,
) {
    fun insert(feature: Feature) {
        jdbc
            .sql(
                """
                INSERT INTO feature (id, mission_id, kind, geometry, min_lon, min_lat, max_lon, max_lat, name, description,
                                     style, sidc, modifiers, origin, suggestion_status, created_at, updated_at)
                VALUES (:id, :missionId, :kind, CAST(:geometry AS jsonb), :minLon, :minLat, :maxLon, :maxLat, :name, :description,
                        CAST(:style AS jsonb), :sidc, CAST(:modifiers AS jsonb), :origin, :suggestionStatus, :createdAt, :updatedAt)
                """.trimIndent(),
            ).bind(feature)
            .param("missionId", feature.missionId)
            .param("createdAt", feature.createdAt.toUtc())
            .update()
    }

    fun update(feature: Feature) {
        jdbc
            .sql(
                """
                UPDATE feature
                SET kind = :kind, geometry = CAST(:geometry AS jsonb), min_lon = :minLon, min_lat = :minLat,
                    max_lon = :maxLon, max_lat = :maxLat, name = :name, description = :description,
                    style = CAST(:style AS jsonb), sidc = :sidc, modifiers = CAST(:modifiers AS jsonb),
                    origin = :origin, suggestion_status = :suggestionStatus, updated_at = :updatedAt
                WHERE id = :id
                """.trimIndent(),
            ).bind(feature)
            .update()
    }

    fun find(
        missionId: UUID,
        id: UUID,
    ): Feature? =
        jdbc
            .sql("SELECT * FROM feature WHERE mission_id = :missionId AND id = :id")
            .param("missionId", missionId)
            .param("id", id)
            .query { rs, _ -> map(rs) }
            .optional()
            .orElse(null)

    fun findByMission(missionId: UUID): List<Feature> =
        jdbc
            .sql("SELECT * FROM feature WHERE mission_id = :missionId ORDER BY created_at, id")
            .param("missionId", missionId)
            .query { rs, _ -> map(rs) }
            .list()

    fun delete(id: UUID) {
        jdbc.sql("DELETE FROM feature WHERE id = :id").param("id", id).update()
    }

    private fun JdbcClient.StatementSpec.bind(feature: Feature): JdbcClient.StatementSpec =
        param("id", feature.id)
            .param("kind", feature.kind.name)
            .param("geometry", json.writeValueAsString(feature.geometry))
            .param("minLon", feature.bbox.minLon)
            .param("minLat", feature.bbox.minLat)
            .param("maxLon", feature.bbox.maxLon)
            .param("maxLat", feature.bbox.maxLat)
            .param("name", feature.name)
            .param("description", feature.description)
            .param("style", feature.style?.let(json::writeValueAsString))
            .param("sidc", feature.sidc)
            .param("modifiers", feature.modifiers?.let(json::writeValueAsString))
            .param("origin", feature.origin.name)
            .param("suggestionStatus", feature.suggestionStatus?.name)
            .param("updatedAt", feature.updatedAt.toUtc())

    private fun map(rs: ResultSet) =
        Feature(
            id = rs.getObject("id", UUID::class.java),
            missionId = rs.getObject("mission_id", UUID::class.java),
            kind = FeatureKind.valueOf(rs.getString("kind")),
            geometry = readMap(rs.getString("geometry"))!!,
            bbox = BBox(rs.getDouble("min_lon"), rs.getDouble("min_lat"), rs.getDouble("max_lon"), rs.getDouble("max_lat")),
            name = rs.getString("name"),
            description = rs.getString("description"),
            style = readMap(rs.getString("style")),
            sidc = rs.getString("sidc"),
            modifiers = readMap(rs.getString("modifiers"))?.mapValues { it.value.toString() },
            origin = FeatureOrigin.valueOf(rs.getString("origin")),
            suggestionStatus = rs.getString("suggestion_status")?.let(SuggestionStatus::valueOf),
            createdAt = rs.instant("created_at")!!,
            updatedAt = rs.instant("updated_at")!!,
        )

    @Suppress("UNCHECKED_CAST")
    private fun readMap(text: String?): Map<String, Any?>? = text?.let { json.readValue(it, Map::class.java) as Map<String, Any?> }
}
