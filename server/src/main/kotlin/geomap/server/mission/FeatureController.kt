package geomap.server.mission

import geomap.server.security.Actor
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/missions/{missionId}/features")
@PreAuthorize("hasRole('planificateur')")
class FeatureController(
    private val service: FeatureService,
) {
    @GetMapping
    fun list(
        @PathVariable missionId: UUID,
    ): List<Feature> = service.list(missionId)

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @PathVariable missionId: UUID,
        @RequestBody input: FeatureInput,
        authentication: Authentication,
    ): Feature = service.create(Actor.of(authentication), missionId, input)

    @PutMapping("/{featureId}")
    fun update(
        @PathVariable missionId: UUID,
        @PathVariable featureId: UUID,
        @RequestBody input: FeatureInput,
        authentication: Authentication,
    ): Feature = service.update(Actor.of(authentication), missionId, featureId, input)

    @DeleteMapping("/{featureId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(
        @PathVariable missionId: UUID,
        @PathVariable featureId: UUID,
        authentication: Authentication,
    ) = service.delete(Actor.of(authentication), missionId, featureId)

    @PostMapping("/{featureId}/accept")
    fun accept(
        @PathVariable missionId: UUID,
        @PathVariable featureId: UUID,
        authentication: Authentication,
    ): Feature = service.accept(Actor.of(authentication), missionId, featureId)

    @PostMapping("/{featureId}/reject")
    fun reject(
        @PathVariable missionId: UUID,
        @PathVariable featureId: UUID,
        authentication: Authentication,
    ): Feature = service.reject(Actor.of(authentication), missionId, featureId)
}
