package geomap.server.mission

import geomap.server.IntegrationTest
import geomap.server.security.Actor
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.concurrent.CompletableFuture
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MissionConcurrencyTest : IntegrationTest() {
    @Autowired
    private lateinit var service: MissionService

    @Autowired
    private lateinit var missions: MissionRepository

    @Autowired
    private lateinit var transactions: TransactionTemplate

    private val alice = Actor("alice", null)

    @Test
    fun `touching a stale mission does not overwrite fields changed meanwhile`() {
        val stale = service.create(alice, MissionInput(name = "Op Nord"))
        missions.update(stale.copy(name = "Op Sud"))
        service.touch(alice, stale.id, Instant.now())
        assertEquals("Op Sud", missions.find(stale.id)!!.name)
    }

    @Test
    fun `an editable mission is locked until the transaction ends`() {
        val id = service.create(alice, MissionInput(name = "Op Nord")).id
        val otherWriterBlocked =
            transactions.execute {
                service.editable(id)
                CompletableFuture
                    .supplyAsync {
                        runCatching {
                            jdbc
                                .sql("SELECT id FROM mission WHERE id = :id FOR UPDATE NOWAIT")
                                .param("id", id)
                                .query()
                                .listOfRows()
                        }.isFailure
                    }.get()
            }!!
        assertTrue(otherWriterBlocked, "a concurrent writer must wait for the mission lock")
    }
}
