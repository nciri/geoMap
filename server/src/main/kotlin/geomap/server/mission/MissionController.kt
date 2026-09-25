package geomap.server.mission

import geomap.server.security.Actor
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/missions")
@PreAuthorize("hasRole('planificateur')")
class MissionController(
    private val service: MissionService,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @RequestBody input: MissionInput,
        authentication: Authentication,
    ): Mission = service.create(Actor.of(authentication), input)

    @GetMapping
    fun list(): List<Mission> = service.list()

    @GetMapping("/{id}")
    fun get(
        @PathVariable id: UUID,
    ): Mission = service.get(id)

    @PatchMapping("/{id}")
    fun update(
        @PathVariable id: UUID,
        @RequestBody patch: MissionPatch,
        authentication: Authentication,
    ): Mission = service.update(Actor.of(authentication), id, patch)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(
        @PathVariable id: UUID,
        authentication: Authentication,
    ) = service.delete(Actor.of(authentication), id)
}
