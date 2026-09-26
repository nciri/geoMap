package geomap.server.publication

import geomap.server.security.Actor
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/missions/{missionId}")
@PreAuthorize("hasRole('planificateur')")
class PublicationController(
    private val service: PublicationService,
) {
    @PostMapping("/publish")
    @ResponseStatus(HttpStatus.CREATED)
    fun publish(
        @PathVariable missionId: UUID,
        authentication: Authentication,
    ): PublicationView = service.publish(Actor.of(authentication), missionId)

    @GetMapping("/versions")
    fun versions(
        @PathVariable missionId: UUID,
    ): List<PublicationView> = service.versions(missionId)
}
