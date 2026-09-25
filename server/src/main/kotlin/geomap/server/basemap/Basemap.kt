package geomap.server.basemap

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant

data class Basemap(
    val id: String,
    val name: String,
    val sizeBytes: Long,
    val sha256: String,
    val signature: String,
    val createdBy: String,
    val createdAt: Instant,
)

@Repository
class BasemapRepository(
    private val jdbc: JdbcClient,
) {
    fun insert(basemap: Basemap) {
        jdbc
            .sql(
                """
                INSERT INTO basemap (id, name, size_bytes, sha256, signature, created_by, created_at)
                VALUES (:id, :name, :sizeBytes, :sha256, :signature, :createdBy, :createdAt)
                """.trimIndent(),
            ).param("id", basemap.id)
            .param("name", basemap.name)
            .param("sizeBytes", basemap.sizeBytes)
            .param("sha256", basemap.sha256)
            .param("signature", basemap.signature)
            .param("createdBy", basemap.createdBy)
            .param("createdAt", basemap.createdAt.toUtc())
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

    private fun map(rs: ResultSet) =
        Basemap(
            id = rs.getString("id"),
            name = rs.getString("name"),
            sizeBytes = rs.getLong("size_bytes"),
            sha256 = rs.getString("sha256"),
            signature = rs.getString("signature"),
            createdBy = rs.getString("created_by"),
            createdAt = rs.instant("created_at")!!,
        )
}
