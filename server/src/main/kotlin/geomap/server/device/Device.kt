package geomap.server.device

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.security.KeyFactory
import java.security.PublicKey
import java.security.spec.X509EncodedKeySpec
import java.sql.ResultSet
import java.time.Instant
import java.util.Base64
import java.util.UUID

enum class DeviceStatus { ENROLLED, REVOKED }

data class Device(
    val id: UUID,
    val name: String,
    val certSha256: String,
    val encryptionKey: String,
    val status: DeviceStatus,
    val lastContact: Instant?,
    val createdAt: Instant,
) {
    fun publicKey(): PublicKey = KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(encryptionKey)))

    fun view() = DeviceView(id, name, certSha256, status, lastContact, createdAt)
}

data class DeviceView(
    val id: UUID,
    val name: String,
    val certSha256: String,
    val status: DeviceStatus,
    val lastContact: Instant?,
    val createdAt: Instant,
)

@Repository
class DeviceRepository(
    private val jdbc: JdbcClient,
) {
    fun insert(device: Device) {
        jdbc
            .sql(
                """
                INSERT INTO device (id, name, cert_sha256, encryption_key, status, last_contact, created_at)
                VALUES (:id, :name, :certSha256, :encryptionKey, :status, :lastContact, :createdAt)
                """.trimIndent(),
            ).param("id", device.id)
            .param("name", device.name)
            .param("certSha256", device.certSha256)
            .param("encryptionKey", device.encryptionKey)
            .param("status", device.status.name)
            .param("lastContact", device.lastContact?.toUtc())
            .param("createdAt", device.createdAt.toUtc())
            .update()
    }

    fun find(id: UUID): Device? =
        jdbc
            .sql("SELECT * FROM device WHERE id = :id")
            .param("id", id)
            .query { rs, _ -> map(rs) }
            .optional()
            .orElse(null)

    fun findAll(): List<Device> = jdbc.sql("SELECT * FROM device ORDER BY name, id").query { rs, _ -> map(rs) }.list()

    // Locks the device row so a concurrent revoke cannot commit between this check and the assignment.
    fun findForUpdate(id: UUID): Device? =
        jdbc
            .sql("SELECT * FROM device WHERE id = :id FOR UPDATE")
            .param("id", id)
            .query { rs, _ -> map(rs) }
            .optional()
            .orElse(null)

    fun updateStatus(
        id: UUID,
        status: DeviceStatus,
    ) {
        jdbc
            .sql("UPDATE device SET status = :status WHERE id = :id")
            .param("id", id)
            .param("status", status.name)
            .update()
    }

    fun map(rs: ResultSet) =
        Device(
            id = rs.getObject("id", UUID::class.java),
            name = rs.getString("name"),
            certSha256 = rs.getString("cert_sha256"),
            encryptionKey = rs.getString("encryption_key"),
            status = DeviceStatus.valueOf(rs.getString("status")),
            lastContact = rs.instant("last_contact"),
            createdAt = rs.instant("created_at")!!,
        )
}

@Repository
class AssignmentRepository(
    private val jdbc: JdbcClient,
    private val devices: DeviceRepository,
) {
    fun replace(
        missionId: UUID,
        deviceIds: Set<UUID>,
    ) {
        jdbc.sql("DELETE FROM assignment WHERE mission_id = :missionId").param("missionId", missionId).update()
        deviceIds.forEach {
            jdbc
                .sql("INSERT INTO assignment (mission_id, device_id) VALUES (:missionId, :deviceId)")
                .param("missionId", missionId)
                .param("deviceId", it)
                .update()
        }
    }

    fun devices(missionId: UUID): List<Device> =
        jdbc
            .sql("SELECT d.* FROM device d JOIN assignment a ON a.device_id = d.id WHERE a.mission_id = :missionId ORDER BY d.name, d.id")
            .param("missionId", missionId)
            .query { rs, _ -> devices.map(rs) }
            .list()
}
