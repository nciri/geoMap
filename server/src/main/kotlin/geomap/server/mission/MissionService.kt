package geomap.server.mission

import geomap.server.audit.AuditEvent
import geomap.server.audit.AuditRepository
import geomap.server.publication.MissionVersionRepository
import geomap.server.security.Actor
import geomap.server.web.ConflictException
import geomap.server.web.ForbiddenException
import geomap.server.web.InvalidInputException
import geomap.server.web.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.util.UUID

data class MissionInput(
    val name: String,
    val basemapId: String? = null,
    val validUntil: Instant? = null,
)

data class MissionPatch(
    val name: String? = null,
    val basemapId: String? = null,
    val validUntil: Instant? = null,
)

@Service
class MissionService(
    private val missions: MissionRepository,
    private val audit: AuditRepository,
    private val clock: Clock,
    private val versions: MissionVersionRepository,
) {
    @Transactional
    fun create(
        actor: Actor,
        input: MissionInput,
    ): Mission {
        val now = clock.instant()
        val mission =
            Mission(
                id = UUID.randomUUID(),
                name = validName(input.name),
                status = MissionStatus.DRAFT,
                basemapId = input.basemapId?.let(::validBasemapId),
                validUntil = input.validUntil?.let { validExpiry(it, now) },
                createdBy = actor.user,
                updatedBy = actor.user,
                createdAt = now,
                updatedAt = now,
            )
        missions.insert(mission)
        record(actor, "mission.create", "mission:${mission.id}")
        return mission
    }

    fun list(): List<Mission> = missions.findAll()

    fun get(id: UUID): Mission = missions.find(id) ?: throw NotFoundException("mission not found")

    @Transactional
    fun update(
        actor: Actor,
        id: UUID,
        patch: MissionPatch,
    ): Mission {
        // Agents only propose objects; mission fields go unreviewed into the next publication (spec §9).
        if (actor.isAgent) throw ForbiddenException("agents cannot change a mission")
        val current = editable(id)
        val now = clock.instant()
        val updated =
            current.copy(
                name = patch.name?.let(::validName) ?: current.name,
                basemapId = patch.basemapId?.let(::validBasemapId) ?: current.basemapId,
                validUntil = patch.validUntil?.let { validExpiry(it, now) } ?: current.validUntil,
            )
        missions.update(updated.copy(status = MissionStatus.DRAFT, updatedBy = actor.user, updatedAt = now))
        val fields = listOfNotNull(patch.name?.let { "name" }, patch.basemapId?.let { "basemapId" }, patch.validUntil?.let { "validUntil" })
        record(actor, "mission.update", "mission:$id", mapOf("fields" to fields))
        return get(id)
    }

    @Transactional
    fun delete(
        actor: Actor,
        id: UUID,
    ) {
        if (actor.isAgent) throw ForbiddenException("agents cannot delete missions")
        if (versions.exists(id)) throw ConflictException("a published mission cannot be deleted; withdraw it instead")
        if (get(id).status != MissionStatus.DRAFT) throw ConflictException("only draft missions can be deleted")
        missions.delete(id)
        record(actor, "mission.delete", "mission:$id")
    }

    @Transactional
    fun withdraw(
        actor: Actor,
        id: UUID,
    ): Mission {
        if (actor.isAgent) throw ForbiddenException("only a human can withdraw a mission")
        val mission = editable(id)
        missions.update(mission.copy(status = MissionStatus.WITHDRAWN, updatedBy = actor.user, updatedAt = clock.instant()))
        record(actor, "mission.withdraw", "mission:$id")
        return get(id)
    }

    fun editable(id: UUID): Mission {
        val mission = missions.findForUpdate(id) ?: throw NotFoundException("mission not found")
        if (mission.status == MissionStatus.WITHDRAWN) throw ConflictException("mission is withdrawn")
        return mission
    }

    // Any change sends the mission back to draft until it is published again (spec §5.3).
    // Only these columns are written, so a stale snapshot cannot undo a concurrent change.
    fun touch(
        actor: Actor,
        missionId: UUID,
        now: Instant,
    ) {
        missions.markDraft(missionId, actor.user, now)
    }

    fun record(
        actor: Actor,
        action: String,
        target: String,
        details: Map<String, Any?> = emptyMap(),
    ) {
        audit.record(AuditEvent(clock.instant(), actor.user, actor.agent, action, target, details))
    }

    private fun validName(name: String): String {
        val trimmed = name.trim()
        if (trimmed.length !in 1..200) throw InvalidInputException("name must be 1 to 200 characters")
        return trimmed
    }

    private fun validBasemapId(id: String): String {
        if (!BASEMAP_ID.matches(id)) throw InvalidInputException("basemapId must match ${BASEMAP_ID.pattern}")
        return id
    }

    private fun validExpiry(
        validUntil: Instant,
        now: Instant,
    ): Instant {
        if (!validUntil.isAfter(now)) throw InvalidInputException("validUntil must be in the future")
        return validUntil
    }

    private companion object {
        val BASEMAP_ID = Regex("^[a-z0-9-]{1,64}$")
    }
}
