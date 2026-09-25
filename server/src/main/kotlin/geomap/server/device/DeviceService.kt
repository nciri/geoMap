package geomap.server.device

import geomap.server.audit.AuditEvent
import geomap.server.audit.AuditRepository
import geomap.server.mission.MissionService
import geomap.server.security.Actor
import geomap.server.security.Pem
import geomap.server.web.ConflictException
import geomap.server.web.ForbiddenException
import geomap.server.web.InvalidInputException
import geomap.server.web.NotFoundException
import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.interfaces.RSAPublicKey
import java.time.Clock
import java.util.Base64
import java.util.UUID

data class DeviceRegistration(
    val name: String,
    val certSha256: String,
    val encryptionPublicKeyPem: String,
)

data class Assignment(
    val deviceIds: Set<UUID>,
)

@Service
class DeviceService(
    private val devices: DeviceRepository,
    private val assignments: AssignmentRepository,
    private val missions: MissionService,
    private val audit: AuditRepository,
    private val clock: Clock,
) {
    fun list(): List<Device> = devices.findAll()

    @Transactional
    fun register(
        actor: Actor,
        registration: DeviceRegistration,
    ): Device {
        val name = registration.name.trim()
        if (name.length !in 1..100) throw InvalidInputException("name must be 1 to 100 characters")
        if (!FINGERPRINT.matches(registration.certSha256)) throw InvalidInputException("certSha256 must be 64 lowercase hex characters")
        val key =
            runCatching { Pem.publicKey(registration.encryptionPublicKeyPem, "RSA") as RSAPublicKey }
                .getOrNull()
                ?.takeIf { it.modulus.bitLength() >= MIN_RSA_BITS }
                ?: throw InvalidInputException("the encryption key must be RSA with at least $MIN_RSA_BITS bits")
        val now = clock.instant()
        val device =
            Device(
                UUID.randomUUID(),
                name,
                registration.certSha256,
                Base64.getEncoder().encodeToString(key.encoded),
                DeviceStatus.ENROLLED,
                null,
                now,
            )
        try {
            devices.insert(device)
        } catch (e: DuplicateKeyException) {
            throw ConflictException("a device with this certificate is already registered")
        }
        audit.record(AuditEvent(now, actor.user, actor.agent, "device.register", "device:${device.id}", emptyMap()))
        return device
    }

    @Transactional
    fun revoke(
        actor: Actor,
        id: UUID,
    ): Device {
        val device = devices.find(id) ?: throw NotFoundException("device not found")
        devices.updateStatus(id, DeviceStatus.REVOKED)
        audit.record(AuditEvent(clock.instant(), actor.user, actor.agent, "device.revoke", "device:$id", emptyMap()))
        return device.copy(status = DeviceStatus.REVOKED)
    }

    fun assigned(missionId: UUID): List<Device> {
        missions.get(missionId)
        return assignments.devices(missionId)
    }

    @Transactional
    fun assign(
        actor: Actor,
        missionId: UUID,
        deviceIds: Set<UUID>,
    ): List<Device> {
        if (actor.isAgent) throw ForbiddenException("only a human can assign devices")
        missions.editable(missionId)
        // Lock devices in a consistent order across all callers so two concurrent assignments
        // can never wait on each other's rows in opposite directions (deadlock -> 500).
        // 2c-2 must lock devices in this same order.
        deviceIds.sorted().forEach { id ->
            if (devices.findForUpdate(id)?.status != DeviceStatus.ENROLLED) throw InvalidInputException("device $id is not enrolled")
        }
        assignments.replace(missionId, deviceIds)
        audit.record(
            AuditEvent(
                clock.instant(),
                actor.user,
                actor.agent,
                "mission.assign",
                "mission:$missionId",
                mapOf("devices" to deviceIds.size),
            ),
        )
        return assignments.devices(missionId)
    }

    private companion object {
        val FINGERPRINT = Regex("^[0-9a-f]{64}$")
        const val MIN_RSA_BITS = 3072
    }
}
