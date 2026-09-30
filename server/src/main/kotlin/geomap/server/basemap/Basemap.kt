package geomap.server.basemap

import geomap.server.db.instant
import geomap.server.db.toUtc
import geomap.server.mission.BBox
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant

data class Basemap(
    val id: String,
    val name: String,
    val sizeBytes: Long,
    val objectKey: String,
    val sha256: String,
    val signature: String,
    val createdBy: String,
    val createdAt: Instant,
    val kind: BasemapKind = BasemapKind.VECTOR,
    val attribution: String = "",
    val bounds: BBox? = null,
)

@Repository
class BasemapRepository(
    private val jdbc: JdbcClient,
) {
    fun insert(basemap: Basemap) {
        jdbc
            .sql(
                """
                INSERT INTO basemap (id, name, size_bytes, object_key, sha256, signature, created_by, created_at,
                    kind, attribution, min_lon, min_lat, max_lon, max_lat)
                VALUES (:id, :name, :sizeBytes, :objectKey, :sha256, :signature, :createdBy, :createdAt,
                    :kind, :attribution, :minLon, :minLat, :maxLon, :maxLat)
                """.trimIndent(),
            ).param("id", basemap.id)
            .param("name", basemap.name)
            .param("sizeBytes", basemap.sizeBytes)
            .param("objectKey", basemap.objectKey)
            .param("sha256", basemap.sha256)
            .param("signature", basemap.signature)
            .param("createdBy", basemap.createdBy)
            .param("createdAt", basemap.createdAt.toUtc())
            .param("kind", basemap.kind.name)
            .param("attribution", basemap.attribution)
            .param("minLon", basemap.bounds?.minLon)
            .param("minLat", basemap.bounds?.minLat)
            .param("maxLon", basemap.bounds?.maxLon)
            .param("maxLat", basemap.bounds?.maxLat)
            .update()
    }

    fun find(id: String): Basemap? =
        jdbc
            .sql("SELECT * FROM basemap WHERE id = :id")
            .param("id", id)
            .query { rs, _ -> map(rs) }
            .optional()
            .orElse(null)

    fun findAll(): List<Basemap> = jdbc.sql("SELECT * FROM basemap ORDER BY id").query { rs, _ -> map(rs) }.list()

    fun findWithoutBounds(): List<Basemap> = jdbc.sql("SELECT * FROM basemap WHERE min_lon IS NULL").query { rs, _ -> map(rs) }.list()

    fun updateDescription(
        id: String,
        kind: BasemapKind,
        attribution: String,
        bounds: BBox,
    ) {
        jdbc
            .sql(
                """
                UPDATE basemap SET kind = :kind, attribution = :attribution,
                    min_lon = :minLon, min_lat = :minLat, max_lon = :maxLon, max_lat = :maxLat
                WHERE id = :id
                """.trimIndent(),
            ).param("id", id)
            .param("kind", kind.name)
            .param("attribution", attribution)
            .param("minLon", bounds.minLon)
            .param("minLat", bounds.minLat)
            .param("maxLon", bounds.maxLon)
            .param("maxLat", bounds.maxLat)
            .update()
    }

    private fun map(rs: ResultSet) =
        Basemap(
            id = rs.getString("id"),
            name = rs.getString("name"),
            sizeBytes = rs.getLong("size_bytes"),
            objectKey = rs.getString("object_key"),
            sha256 = rs.getString("sha256"),
            signature = rs.getString("signature"),
            createdBy = rs.getString("created_by"),
            createdAt = rs.instant("created_at")!!,
            kind = BasemapKind.valueOf(rs.getString("kind")),
            attribution = rs.getString("attribution"),
            bounds =
                rs.getObject("min_lon")?.let {
                    BBox(rs.getDouble("min_lon"), rs.getDouble("min_lat"), rs.getDouble("max_lon"), rs.getDouble("max_lat"))
                },
        )
}
