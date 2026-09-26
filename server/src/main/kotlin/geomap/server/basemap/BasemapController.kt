package geomap.server.basemap

import geomap.server.security.Actor
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpRange
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestHeader
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

    // Written straight to the response: MinIO streams the slice, nothing is buffered in memory.
    @GetMapping("/{id}/pmtiles")
    @PreAuthorize("hasAnyRole('planificateur', 'administrateur')")
    fun tiles(
        @PathVariable id: String,
        @RequestHeader(HttpHeaders.RANGE, required = false) range: String?,
        response: HttpServletResponse,
    ) {
        val basemap = service.get(id)
        val size = basemap.sizeBytes
        response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes")
        response.setHeader(HttpHeaders.ETAG, "\"${basemap.sha256}\"")
        // A basemap id can never be re-uploaded, so its bytes never change.
        response.setHeader(HttpHeaders.CACHE_CONTROL, "max-age=86400, private")
        val (start, end) =
            if (range == null) {
                0L to size - 1
            } else {
                satisfiable(range, size) ?: run {
                    response.status = HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE.value()
                    response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes */$size")
                    return
                }
            }
        if (range != null) {
            response.status = HttpStatus.PARTIAL_CONTENT.value()
            response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes $start-$end/$size")
        }
        response.contentType = "application/vnd.pmtiles"
        response.setContentLengthLong(end - start + 1)
        service.read(basemap, start, end - start + 1).use { it.transferTo(response.outputStream) }
    }

    private fun satisfiable(
        header: String,
        size: Long,
    ): Pair<Long, Long>? =
        try {
            HttpRange.parseRanges(header).singleOrNull()?.let { it.getRangeStart(size) to it.getRangeEnd(size) }?.takeIf { (start, end) ->
                start < size && start <= end
            }
        } catch (e: IllegalArgumentException) {
            null
        }
}
