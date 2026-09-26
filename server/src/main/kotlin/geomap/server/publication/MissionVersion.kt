package geomap.server.publication

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

data class MissionVersion(
    val id: UUID,
    val missionId: UUID,
    val number: Int,
    val missionName: String,
    val basemapId: String,
    val basemapSha256: String,
    val validUntil: Instant,
    val snapshot: String,
    val objectKey: String,
    val sha256: String,
    val sizeBytes: Long,
    val recipients: Int,
    val publishedBy: String,
    val publishedAt: Instant,
) {
    fun view() = PublicationView(missionId, number, sha256, sizeBytes, recipients, publishedBy, publishedAt)
}

data class PublicationView(
    val missionId: UUID,
    val version: Int,
    val sha256: String,
    val sizeBytes: Long,
    val recipients: Int,
    val publishedBy: String,
    val publishedAt: Instant,
)

@Repository
class MissionVersionRepository(
    private val jdbc: JdbcClient,
) {
    fun insert(version: MissionVersion) {
        jdbc
            .sql(
                """
                INSERT INTO mission_version (id, mission_id, number, mission_name, basemap_id, basemap_sha256, valid_until, snapshot,
                                             object_key, sha256, size_bytes, recipients, published_by, published_at)
                VALUES (:id, :missionId, :number, :missionName, :basemapId, :basemapSha256, :validUntil, CAST(:snapshot AS jsonb),
                        :objectKey, :sha256, :sizeBytes, :recipients, :publishedBy, :publishedAt)
                """.trimIndent(),
            ).param("id", version.id)
            .param("missionId", version.missionId)
            .param("number", version.number)
            .param("missionName", version.missionName)
            .param("basemapId", version.basemapId)
            .param("basemapSha256", version.basemapSha256)
            .param("validUntil", version.validUntil.toUtc())
            .param("snapshot", version.snapshot)
            .param("objectKey", version.objectKey)
            .param("sha256", version.sha256)
            .param("sizeBytes", version.sizeBytes)
            .param("recipients", version.recipients)
            .param("publishedBy", version.publishedBy)
            .param("publishedAt", version.publishedAt.toUtc())
            .update()
    }

    fun updatePackage(version: MissionVersion) {
        jdbc
            .sql(
                "UPDATE mission_version SET object_key = :objectKey, sha256 = :sha256, size_bytes = :sizeBytes, recipients = :recipients WHERE id = :id",
            ).param("id", version.id)
            .param("objectKey", version.objectKey)
            .param("sha256", version.sha256)
            .param("sizeBytes", version.sizeBytes)
            .param("recipients", version.recipients)
            .update()
    }

    fun latest(missionId: UUID): MissionVersion? = all(missionId).firstOrNull()

    // ponytail: loads every version with its snapshot; add a projection without `snapshot` if missions accumulate many large versions.
    fun all(missionId: UUID): List<MissionVersion> =
        jdbc
            .sql("SELECT * FROM mission_version WHERE mission_id = :missionId ORDER BY number DESC")
            .param("missionId", missionId)
            .query { rs, _ -> map(rs) }
            .list()

    fun exists(missionId: UUID): Boolean =
        jdbc
            .sql("SELECT EXISTS (SELECT 1 FROM mission_version WHERE mission_id = :missionId)")
            .param("missionId", missionId)
            .query(Boolean::class.java)
            .single()

    private fun map(rs: ResultSet) =
        MissionVersion(
            id = rs.getObject("id", UUID::class.java),
            missionId = rs.getObject("mission_id", UUID::class.java),
            number = rs.getInt("number"),
            missionName = rs.getString("mission_name"),
            basemapId = rs.getString("basemap_id"),
            basemapSha256 = rs.getString("basemap_sha256"),
            validUntil = rs.instant("valid_until")!!,
            snapshot = rs.getString("snapshot"),
            objectKey = rs.getString("object_key"),
            sha256 = rs.getString("sha256"),
            sizeBytes = rs.getLong("size_bytes"),
            recipients = rs.getInt("recipients"),
            publishedBy = rs.getString("published_by"),
            publishedAt = rs.instant("published_at")!!,
        )
}
