package geomap.server.publication

import geomap.pkg.BasemapRef
import geomap.pkg.MissionHeader
import geomap.pkg.PackageBuilder
import geomap.pkg.RecipientKey
import geomap.pkg.Sha256
import geomap.server.audit.AuditEvent
import geomap.server.audit.AuditRepository
import geomap.server.basemap.BasemapRepository
import geomap.server.device.AssignmentRepository
import geomap.server.device.Device
import geomap.server.device.DeviceRepository
import geomap.server.device.DeviceStatus
import geomap.server.mission.Feature
import geomap.server.mission.FeatureOrigin
import geomap.server.mission.FeatureRepository
import geomap.server.mission.MissionRepository
import geomap.server.mission.MissionService
import geomap.server.mission.MissionValidator
import geomap.server.mission.SuggestionStatus
import geomap.server.security.Actor
import geomap.server.security.ServerSigningKey
import geomap.server.storage.ObjectStore
import geomap.server.web.ConflictException
import geomap.server.web.ForbiddenException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.util.UUID

@Service
class PublicationService(
    private val missions: MissionService,
    private val missionRows: MissionRepository,
    private val features: FeatureRepository,
    private val validator: MissionValidator,
    private val basemaps: BasemapRepository,
    private val devices: DeviceRepository,
    private val assignments: AssignmentRepository,
    private val versions: MissionVersionRepository,
    private val payloads: PayloadBuilder,
    private val store: ObjectStore,
    private val signingKey: ServerSigningKey,
    private val audit: AuditRepository,
    private val json: ObjectMapper,
    private val clock: Clock,
) {
    fun versions(missionId: UUID): List<PublicationView> {
        missions.get(missionId)
        return versions.all(missionId).map { it.view() }
    }

    @Transactional
    fun publish(
        actor: Actor,
        missionId: UUID,
    ): PublicationView {
        if (actor.isAgent) throw ForbiddenException("only a human can publish a mission")
        val mission = missions.editable(missionId)
        val report = validator.validate(missionId)
        if (!report.publishable) throw ConflictException("mission is not publishable: ${report.errors.joinToString { it.code }}")
        val recipients = lockedRecipients(missionId)
        val published =
            features.findByMission(missionId).filter {
                it.origin == FeatureOrigin.HUMAN ||
                    it.suggestionStatus == SuggestionStatus.ACCEPTED
            }
        val basemap = basemaps.find(mission.basemapId!!)!!
        val now = clock.instant()
        val draft =
            MissionVersion(
                id = UUID.randomUUID(),
                missionId = missionId,
                number = (versions.latest(missionId)?.number ?: 0) + 1,
                missionName = mission.name,
                basemapId = basemap.id,
                basemapSha256 = basemap.sha256,
                validUntil = mission.validUntil!!,
                snapshot = json.writeValueAsString(published),
                objectKey = "",
                sha256 = "",
                sizeBytes = 0,
                recipients = 0,
                publishedBy = actor.user,
                publishedAt = now,
            )
        val version = storePackage(draft, published, recipients)
        versions.insert(version)
        missionRows.markPublished(missionId, actor.user, now)
        audit.record(
            AuditEvent(
                now,
                actor.user,
                actor.agent,
                "mission.publish",
                "mission:$missionId",
                mapOf(
                    "version" to version.number,
                    "recipients" to recipients.size,
                ),
            ),
        )
        return version.view()
    }

    // Spec §5.6: a new recipient list rebuilds the latest version under the same number, from its published snapshot.
    // Callers hold the mission lock inside a transaction.
    fun rebuild(
        actor: Actor,
        latest: MissionVersion,
    ): MissionVersion {
        val recipients = lockedRecipients(latest.missionId)
        if (recipients.isEmpty()) throw ConflictException("a published mission needs at least one enrolled device; withdraw it instead")
        val rebuilt = storePackage(latest, snapshotOf(latest), recipients)
        versions.updatePackage(rebuilt)
        audit.record(
            AuditEvent(
                clock.instant(),
                actor.user,
                actor.agent,
                "mission.republish",
                "mission:${latest.missionId}",
                mapOf("version" to latest.number, "recipients" to recipients.size),
            ),
        )
        return rebuilt
    }

    fun snapshotOf(version: MissionVersion): List<Feature> =
        json.readValue(version.snapshot, json.typeFactory.constructCollectionType(List::class.java, Feature::class.java))

    // Mission row first (callers), then devices in ascending id order: the order every writer uses, so no deadlock.
    private fun lockedRecipients(missionId: UUID): List<Device> =
        assignments
            .devices(missionId)
            .map { it.id }
            .sorted()
            .mapNotNull { devices.findForUpdate(it) }
            .filter { it.status == DeviceStatus.ENROLLED }

    private fun storePackage(
        version: MissionVersion,
        published: List<Feature>,
        recipients: List<Device>,
    ): MissionVersion {
        val header =
            MissionHeader(
                version.missionId.toString(),
                version.number,
                version.publishedAt,
                version.validUntil,
                BasemapRef(version.basemapId, version.basemapSha256),
            )
        val bytes =
            try {
                PackageBuilder(signingKey.privateKey).build(
                    header,
                    payloads.build(version.missionName, published),
                    recipients.map { RecipientKey(it.certSha256, it.publicKey()) },
                )
            } catch (e: IllegalArgumentException) {
                throw ConflictException("mission cannot be packaged: ${e.message}")
            }
        val key = "packages/${version.missionId}/${version.number}-${UUID.randomUUID()}.gmp"
        store.put(key, bytes.inputStream(), bytes.size.toLong(), "application/octet-stream")
        return version.copy(objectKey = key, sha256 = Sha256.hex(bytes), sizeBytes = bytes.size.toLong(), recipients = recipients.size)
    }
}
