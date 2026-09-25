package geomap.server.audit

import geomap.server.web.InvalidInputException
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/audit")
@PreAuthorize("hasRole('administrateur')")
class AuditController(
    private val audit: AuditRepository,
) {
    @GetMapping
    fun latest(
        @RequestParam(defaultValue = "100") limit: Int,
    ): List<AuditEvent> {
        if (limit !in 1..1000) throw InvalidInputException("limit must be between 1 and 1000")
        return audit.latest(limit)
    }
}
