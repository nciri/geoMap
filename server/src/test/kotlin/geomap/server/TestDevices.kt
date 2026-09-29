package geomap.server

import geomap.server.device.Device
import geomap.server.device.DeviceRepository
import geomap.server.device.DeviceStatus
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.time.Instant
import java.util.Base64
import java.util.UUID

// One RSA-3072 pair shared by all test devices (generation takes ~1 s); devices differ by certificate fingerprint.
object TestDevices {
    val keys: KeyPair by lazy { KeyPairGenerator.getInstance("RSA").apply { initialize(3072) }.generateKeyPair() }

    fun insert(
        repo: DeviceRepository,
        cert: Char,
        status: DeviceStatus = DeviceStatus.ENROLLED,
    ): Device {
        val device =
            Device(
                UUID.randomUUID(),
                "Tablette $cert",
                "$cert".repeat(64),
                Base64.getEncoder().encodeToString(keys.public.encoded),
                status,
                null,
                Instant.now(),
            )
        repo.insert(device)
        return device
    }
}
