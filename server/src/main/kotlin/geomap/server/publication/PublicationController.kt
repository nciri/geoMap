package geomap.server.publication

import geomap.server.security.Actor
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
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

    @GetMapping("/package")
    fun export(
        @PathVariable missionId: UUID,
        authentication: Authentication,
    ): ResponseEntity<ByteArray> {
        val (version, bytes) = service.export(Actor.of(authentication), missionId)
        val disposition = ContentDisposition.attachment().filename("$missionId-v${version.number}.gmp").build()
        return ResponseEntity
            .ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
            .body(bytes)
    }
}
