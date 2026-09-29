package geomap.server.device

import geomap.server.security.Actor
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class DeviceController(
    private val service: DeviceService,
) {
    @PostMapping("/api/devices")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('administrateur')")
    fun register(
        @RequestBody registration: DeviceRegistration,
        authentication: Authentication,
    ): DeviceView = service.register(Actor.of(authentication), registration).view()

    @GetMapping("/api/devices")
    // Planners need the device list to assign missions; registering and revoking stay with administrators.
    @PreAuthorize("hasAnyRole('planificateur', 'administrateur')")
    fun list(): List<DeviceView> = service.list().map { it.view() }

    @PostMapping("/api/devices/{id}/revoke")
    @PreAuthorize("hasRole('administrateur')")
    fun revoke(
        @PathVariable id: UUID,
        authentication: Authentication,
    ): DeviceView = service.revoke(Actor.of(authentication), id).view()

    @PutMapping("/api/missions/{missionId}/devices")
    @PreAuthorize("hasRole('planificateur')")
    fun assign(
        @PathVariable missionId: UUID,
        @RequestBody assignment: Assignment,
        authentication: Authentication,
    ): List<DeviceView> = service.assign(Actor.of(authentication), missionId, assignment.deviceIds).map { it.view() }

    @GetMapping("/api/missions/{missionId}/devices")
    @PreAuthorize("hasRole('planificateur')")
    fun assigned(
        @PathVariable missionId: UUID,
    ): List<DeviceView> = service.assigned(missionId).map { it.view() }
}
