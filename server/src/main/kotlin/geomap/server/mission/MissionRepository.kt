package geomap.server.mission

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

@Repository
class MissionRepository(
    private val jdbc: JdbcClient,
) {
    fun insert(mission: Mission) {
        jdbc
            .sql(
                """
                INSERT INTO mission (id, name, status, basemap_id, valid_until, created_by, updated_by, created_at, updated_at)
                VALUES (:id, :name, :status, :basemapId, :validUntil, :createdBy, :updatedBy, :createdAt, :updatedAt)
                """.trimIndent(),
            ).bind(mission)
            .param("createdBy", mission.createdBy)
            .param("createdAt", mission.createdAt.toUtc())
            .update()
    }

    fun update(mission: Mission) {
        jdbc
            .sql(
                """
                UPDATE mission
                SET name = :name, status = :status, basemap_id = :basemapId, valid_until = :validUntil,
                    updated_by = :updatedBy, updated_at = :updatedAt
                WHERE id = :id
                """.trimIndent(),
            ).bind(mission)
            .update()
    }

    fun markDraft(
        id: UUID,
        updatedBy: String,
        updatedAt: Instant,
    ) {
        jdbc
            .sql("UPDATE mission SET status = 'DRAFT', updated_by = :updatedBy, updated_at = :updatedAt WHERE id = :id")
            .param("id", id)
            .param("updatedBy", updatedBy)
            .param("updatedAt", updatedAt.toUtc())
            .update()
    }

    fun markPublished(
        id: UUID,
        updatedBy: String,
        updatedAt: Instant,
    ) {
        jdbc
            .sql("UPDATE mission SET status = 'PUBLISHED', updated_by = :updatedBy, updated_at = :updatedAt WHERE id = :id")
            .param("id", id)
            .param("updatedBy", updatedBy)
            .param("updatedAt", updatedAt.toUtc())
            .update()
    }

    fun find(id: UUID): Mission? =
        jdbc
            .sql("SELECT * FROM mission WHERE id = :id")
            .param("id", id)
            .query { rs, _ -> map(rs) }
            .optional()
            .orElse(null)

    // Row lock held until the caller's transaction ends: serializes every change to one mission.
    fun findForUpdate(id: UUID): Mission? =
        jdbc
            .sql("SELECT * FROM mission WHERE id = :id FOR UPDATE")
            .param("id", id)
            .query { rs, _ -> map(rs) }
            .optional()
            .orElse(null)

    fun findAll(): List<Mission> =
        jdbc
            .sql("SELECT * FROM mission ORDER BY updated_at DESC, id")
            .query { rs, _ -> map(rs) }
            .list()

    fun delete(id: UUID) {
        jdbc.sql("DELETE FROM mission WHERE id = :id").param("id", id).update()
    }

    private fun JdbcClient.StatementSpec.bind(mission: Mission): JdbcClient.StatementSpec =
        param("id", mission.id)
            .param("name", mission.name)
            .param("status", mission.status.name)
            .param("basemapId", mission.basemapId)
            .param("validUntil", mission.validUntil?.toUtc())
            .param("updatedBy", mission.updatedBy)
            .param("updatedAt", mission.updatedAt.toUtc())

    private fun map(rs: ResultSet) =
        Mission(
            id = rs.getObject("id", UUID::class.java),
            name = rs.getString("name"),
            status = MissionStatus.valueOf(rs.getString("status")),
            basemapId = rs.getString("basemap_id"),
            validUntil = rs.instant("valid_until"),
            createdBy = rs.getString("created_by"),
            updatedBy = rs.getString("updated_by"),
            createdAt = rs.instant("created_at")!!,
            updatedAt = rs.instant("updated_at")!!,
        )
}
