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
import java.util.concurrent.CyclicBarrier
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

    // Two planners assigning {A,B} and {B,A} to two different missions lock the device rows in
    // opposite orders; without a stable lock order Postgres can abort one side with a deadlock (500).
    @Test
    fun `assigning devices in opposite orders across missions does not deadlock`() {
        val mission1 = missions.create(alice, MissionInput(name = "Op Nord")).id
        val mission2 = missions.create(alice, MissionInput(name = "Op Sud")).id
        val publicKey1 =
            KeyPairGenerator
                .getInstance("RSA")
                .apply { initialize(3072) }
                .generateKeyPair()
                .public
        val publicKey2 =
            KeyPairGenerator
                .getInstance("RSA")
                .apply { initialize(3072) }
                .generateKeyPair()
                .public
        val deviceA = service.register(alice, DeviceRegistration("Tablette A", "a".repeat(64), Pem.encode(publicKey1, "PUBLIC KEY"))).id
        val deviceB = service.register(alice, DeviceRegistration("Tablette B", "b".repeat(64), Pem.encode(publicKey2, "PUBLIC KEY"))).id

        repeat(20) {
            val barrier = CyclicBarrier(2)
            val thread1 =
                CompletableFuture.supplyAsync {
                    runCatching {
                        transactions.execute {
                            barrier.await()
                            service.assign(alice, mission1, linkedSetOf(deviceA, deviceB))
                        }
                    }
                }
            val thread2 =
                CompletableFuture.supplyAsync {
                    runCatching {
                        transactions.execute {
                            barrier.await()
                            service.assign(alice, mission2, linkedSetOf(deviceB, deviceA))
                        }
                    }
                }
            val result1 = thread1.get()
            val result2 = thread2.get()
            assertTrue(result1.isSuccess, "thread 1 must not fail: ${result1.exceptionOrNull()}")
            assertTrue(result2.isSuccess, "thread 2 must not fail: ${result2.exceptionOrNull()}")
        }
    }
}
