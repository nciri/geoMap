package geomap.server.mission

import geomap.server.symbology.SymbolCatalog
import geomap.server.symbology.SymbolRenderer
import geomap.server.web.InvalidInputException
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import java.time.Clock
import java.util.UUID

data class ValidationIssue(
    val code: String,
    val message: String,
    val featureId: UUID? = null,
)

data class ValidationReport(
    val errors: List<ValidationIssue>,
    val warnings: List<ValidationIssue>,
) {
    val publishable: Boolean get() = errors.isEmpty()
}

@Service
class MissionValidator(
    private val missions: MissionService,
    private val features: FeatureRepository,
    private val catalog: SymbolCatalog,
    private val renderer: SymbolRenderer,
    private val clock: Clock,
) {
    fun validate(missionId: UUID): ValidationReport {
        val mission = missions.get(missionId)
        val all = features.findByMission(missionId)
        val published = all.filter { it.origin == FeatureOrigin.HUMAN || it.suggestionStatus == SuggestionStatus.ACCEPTED }
        val errors = mutableListOf<ValidationIssue>()
        val warnings = mutableListOf<ValidationIssue>()

        if (mission.basemapId == null) errors += ValidationIssue("NO_BASEMAP", "mission has no basemap")
        val validUntil = mission.validUntil
        when {
            validUntil == null -> errors += ValidationIssue("NO_EXPIRY", "mission has no expiry date")
            !validUntil.isAfter(clock.instant()) -> errors += ValidationIssue("EXPIRED", "mission expiry date is past")
        }
        published.filter { it.kind == FeatureKind.APP6 }.forEach { feature ->
            renderingProblem(feature)?.let { errors += ValidationIssue("SYMBOL_NOT_RENDERABLE", it, feature.id) }
        }

        val pending = all.count { it.suggestionStatus == SuggestionStatus.PENDING }
        if (pending >
            0
        ) {
            warnings += ValidationIssue("PENDING_SUGGESTIONS", "$pending suggestion(s) awaiting a decision will not be published")
        }
        if (published.isEmpty()) warnings += ValidationIssue("EMPTY_MISSION", "mission has no object to publish")
        return ValidationReport(errors, warnings)
    }

    // ponytail: renders every symbol on each call; cache per (sidc, geometry, band) if large missions make validation slow.
    private fun renderingProblem(feature: Feature): String? =
        try {
            val symbol = catalog.validate(feature.sidc, feature.geometry, feature.modifiers)
            renderer.verify(symbol, feature.sidc!!, feature.geometry, feature.modifiers.orEmpty())
            null
        } catch (e: InvalidInputException) {
            e.message
        }
}

@RestController
@PreAuthorize("hasRole('planificateur')")
class MissionValidationController(
    private val validator: MissionValidator,
) {
    @GetMapping("/api/missions/{missionId}/validation")
    fun validate(
        @PathVariable missionId: UUID,
    ): ValidationReport = validator.validate(missionId)
}
