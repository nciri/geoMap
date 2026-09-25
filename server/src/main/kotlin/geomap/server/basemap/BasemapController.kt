package geomap.server.basemap

import geomap.server.security.Actor
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/basemaps")
class BasemapController(
    private val service: BasemapService,
) {
    @GetMapping
    @PreAuthorize("hasAnyRole('planificateur', 'administrateur')")
    fun list(): List<Basemap> = service.list()

    // Raw body instead of multipart: basemaps weigh hundreds of MB and are streamed straight to MinIO.
    @PutMapping("/{id}", consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('administrateur')")
    fun upload(
        @PathVariable id: String,
        @RequestParam name: String,
        request: HttpServletRequest,
        authentication: Authentication,
    ): Basemap = service.upload(Actor.of(authentication), id, name, request.inputStream, request.contentLengthLong)
}
