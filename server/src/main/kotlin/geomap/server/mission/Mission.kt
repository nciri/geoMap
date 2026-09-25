package geomap.server.mission

import java.time.Instant
import java.util.UUID

enum class MissionStatus { DRAFT, PUBLISHED, WITHDRAWN }

enum class FeatureKind { GENERIC, APP6 }

enum class FeatureOrigin { HUMAN, AI_SUGGESTED }

enum class SuggestionStatus { PENDING, ACCEPTED, REJECTED }

data class Mission(
    val id: UUID,
    val name: String,
    val status: MissionStatus,
    val basemapId: String?,
    val validUntil: Instant?,
    val createdBy: String,
    val updatedBy: String,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class Feature(
    val id: UUID,
    val missionId: UUID,
    val kind: FeatureKind,
    val geometry: Map<String, Any?>,
    val bbox: BBox,
    val name: String,
    val description: String,
    val style: Map<String, Any?>?,
    val sidc: String?,
    val modifiers: Map<String, String>?,
    val origin: FeatureOrigin,
    val suggestionStatus: SuggestionStatus?,
    val createdAt: Instant,
    val updatedAt: Instant,
)
