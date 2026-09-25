package geomap.server.mission

import geomap.server.security.Actor
import geomap.server.web.ConflictException
import geomap.server.web.ForbiddenException
import geomap.server.web.InvalidInputException
import geomap.server.web.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.util.UUID

data class FeatureInput(
    val kind: FeatureKind,
    val geometry: Map<String, Any?>,
    val name: String = "",
    val description: String = "",
    val style: Map<String, Any?>? = null,
    val sidc: String? = null,
    val modifiers: Map<String, String>? = null,
)

@Service
class FeatureService(
    private val features: FeatureRepository,
    private val missions: MissionService,
    private val clock: Clock,
) {
    fun list(missionId: UUID): List<Feature> {
        missions.get(missionId)
        return features.findByMission(missionId)
    }

    @Transactional
    fun create(
        actor: Actor,
        missionId: UUID,
        input: FeatureInput,
    ): Feature {
        val mission = missions.editable(missionId)
        val bbox = validate(input)
        val now = clock.instant()
        val origin = if (actor.isAgent) FeatureOrigin.AI_SUGGESTED else FeatureOrigin.HUMAN
        val feature =
            Feature(
                id = UUID.randomUUID(),
                missionId = missionId,
                kind = input.kind,
                geometry = input.geometry,
                bbox = bbox,
                name = input.name,
                description = input.description,
                style = input.style,
                sidc = input.sidc,
                modifiers = input.modifiers,
                origin = origin,
                suggestionStatus = if (actor.isAgent) SuggestionStatus.PENDING else null,
                createdAt = now,
                updatedAt = now,
            )
        features.insert(feature)
        missions.touch(actor, mission.id, now)
        missions.record(actor, "feature.create", "feature:${feature.id}", mapOf("missionId" to "$missionId", "origin" to origin.name))
        return feature
    }

    @Transactional
    fun update(
        actor: Actor,
        missionId: UUID,
        featureId: UUID,
        input: FeatureInput,
    ): Feature {
        val mission = missions.editable(missionId)
        val current = find(missionId, featureId)
        checkAgentMayChange(actor, current)
        val now = clock.instant()
        val updated =
            current.copy(
                kind = input.kind,
                geometry = input.geometry,
                bbox = validate(input),
                name = input.name,
                description = input.description,
                style = input.style,
                sidc = input.sidc,
                modifiers = input.modifiers,
                updatedAt = now,
            )
        features.update(updated)
        missions.touch(actor, mission.id, now)
        missions.record(actor, "feature.update", "feature:$featureId", mapOf("missionId" to "$missionId"))
        return updated
    }

    @Transactional
    fun delete(
        actor: Actor,
        missionId: UUID,
        featureId: UUID,
    ) {
        val mission = missions.editable(missionId)
        checkAgentMayChange(actor, find(missionId, featureId))
        features.delete(featureId)
        missions.touch(actor, mission.id, clock.instant())
        missions.record(actor, "feature.delete", "feature:$featureId", mapOf("missionId" to "$missionId"))
    }

    @Transactional
    fun accept(
        actor: Actor,
        missionId: UUID,
        featureId: UUID,
    ): Feature = decide(actor, missionId, featureId, SuggestionStatus.ACCEPTED, "feature.accept")

    @Transactional
    fun reject(
        actor: Actor,
        missionId: UUID,
        featureId: UUID,
    ): Feature = decide(actor, missionId, featureId, SuggestionStatus.REJECTED, "feature.reject")

    // A human always takes the decision: an AI suggestion never reaches a mission on its own.
    private fun decide(
        actor: Actor,
        missionId: UUID,
        featureId: UUID,
        status: SuggestionStatus,
        action: String,
    ): Feature {
        if (actor.isAgent) throw ForbiddenException("only a human can accept or reject a suggestion")
        val mission = missions.editable(missionId)
        val current = find(missionId, featureId)
        if (!current.isPendingSuggestion()) throw ConflictException("feature is not a pending suggestion")
        val now = clock.instant()
        val decided = current.copy(suggestionStatus = status, updatedAt = now)
        features.update(decided)
        missions.touch(actor, mission.id, now)
        missions.record(actor, action, "feature:$featureId", mapOf("missionId" to "$missionId"))
        return decided
    }

    private fun find(
        missionId: UUID,
        featureId: UUID,
    ): Feature = features.find(missionId, featureId) ?: throw NotFoundException("feature not found")

    private fun checkAgentMayChange(
        actor: Actor,
        feature: Feature,
    ) {
        if (actor.isAgent && !feature.isPendingSuggestion()) throw ForbiddenException("agents can only change their pending suggestions")
    }

    private fun Feature.isPendingSuggestion() = origin == FeatureOrigin.AI_SUGGESTED && suggestionStatus == SuggestionStatus.PENDING

    private fun validate(input: FeatureInput): BBox {
        val bbox = GeoJsonGeometry.validate(input.geometry)
        if (input.name.length > 200) invalid("name must be at most 200 characters")
        if (input.description.length > 4000) invalid("description must be at most 4000 characters")
        when (input.kind) {
            FeatureKind.APP6 -> if (input.sidc == null || !SIDC.matches(input.sidc)) invalid("an APP-6 symbol needs a 20 digit SIDC")
            FeatureKind.GENERIC -> if (input.sidc != null || input.modifiers != null) invalid("a generic object has no SIDC or modifiers")
        }
        input.style?.get("radiusMeters")?.let { radius ->
            if ((radius as? Number)?.toDouble()?.let { it > 0 } != true) invalid("radiusMeters must be a positive number")
            if (input.geometry["type"] != "Point") invalid("radiusMeters only applies to a Point")
        }
        return bbox
    }

    private fun invalid(message: String): Nothing = throw InvalidInputException(message)

    private companion object {
        val SIDC = Regex("^\\d{20}$")
    }
}
