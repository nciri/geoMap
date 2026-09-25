package geomap.server.device

import geomap.server.IntegrationTest
import geomap.server.mission.MissionInput
import geomap.server.mission.MissionService
import geomap.server.security.Actor
import geomap.server.security.Pem
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.support.TransactionTemplate
import java.security.KeyPairGenerator
import java.util.concurrent.CompletableFuture
import kotlin.test.assertTrue

class DeviceConcurrencyTest : IntegrationTest() {
    @Autowired
    private lateinit var service: DeviceService

    @Autowired
    private lateinit var missions: MissionService

    @Autowired
    private lateinit var transactions: TransactionTemplate

    private val alice = Actor("alice", null)

    // Assigning a device inserts into `assignment`, which takes only a FOR KEY SHARE lock on the
    // referenced device row (Postgres' foreign-key check) - that lock does not block a concurrent
    // UPDATE of a non-key column such as `status`. Only `DeviceRepository.findForUpdate`'s explicit
    // FOR UPDATE lock, held for the rest of the `assign` transaction, blocks a concurrent revoke.
    @Test
    fun `an enrolled device is locked against a concurrent revoke while it is being assigned`() {
        val missionId = missions.create(alice, MissionInput(name = "Op Nord")).id
        val publicKey =
            KeyPairGenerator
                .getInstance("RSA")
                .apply { initialize(3072) }
                .generateKeyPair()
                .public
        val deviceId = service.register(alice, DeviceRegistration("Tablette 01", "a".repeat(64), Pem.encode(publicKey, "PUBLIC KEY"))).id

        val concurrentRevokeBlocked =
            transactions.execute {
                service.assign(alice, missionId, setOf(deviceId))
                CompletableFuture
                    .supplyAsync {
                        runCatching {
                            transactions.execute {
                                jdbc.sql("SET LOCAL lock_timeout = '200ms'").update()
                                jdbc.sql("UPDATE device SET status = 'REVOKED' WHERE id = :id").param("id", deviceId).update()
                            }
                        }.isFailure
                    }.get()
            }!!
        assertTrue(concurrentRevokeBlocked, "a concurrent revoke must wait for the device lock")
    }
}
