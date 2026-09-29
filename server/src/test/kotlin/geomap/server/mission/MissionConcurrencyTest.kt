package geomap.server.mission

import geomap.server.IntegrationTest
import geomap.server.basemap.Basemap
import geomap.server.basemap.BasemapRepository
import geomap.server.publication.MissionVersion
import geomap.server.publication.MissionVersionRepository
import geomap.server.security.Actor
import geomap.server.web.ConflictException
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CompletableFuture
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class MissionConcurrencyTest : IntegrationTest() {
    @Autowired
    private lateinit var service: MissionService

    @Autowired
    private lateinit var missions: MissionRepository

    @Autowired
    private lateinit var basemaps: BasemapRepository

    @Autowired
    private lateinit var versions: MissionVersionRepository

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

    @Test
    fun `delete locks the mission before deciding whether it can be deleted`() {
        val mission = service.create(alice, MissionInput(name = "Op Nord"))
        val basemapId = "bm-${UUID.randomUUID()}"
        basemaps.insert(
            Basemap(
                id = basemapId,
                name = "test basemap",
                sizeBytes = 1,
                objectKey = "basemap-key",
                sha256 = "a".repeat(64),
                signature = "sig",
                createdBy = "alice",
                createdAt = Instant.now(),
            ),
        )

        val lockAcquired = CompletableFuture<Void>()
        val publisher =
            CompletableFuture.supplyAsync {
                transactions.execute {
                    service.editable(mission.id)
                    versions.insert(
                        MissionVersion(
                            id = UUID.randomUUID(),
                            missionId = mission.id,
                            number = 1,
                            missionName = mission.name,
                            basemapId = basemapId,
                            basemapSha256 = "a".repeat(64),
                            validUntil = Instant.now().plusSeconds(3600),
                            snapshot = "[]",
                            objectKey = "package-key",
                            sha256 = "b".repeat(64),
                            sizeBytes = 1,
                            recipients = 1,
                            publishedBy = "alice",
                            publishedAt = Instant.now(),
                        ),
                    )
                    lockAcquired.complete(null)
                    Thread.sleep(500)
                }
            }

        lockAcquired.get()
        val thrown = assertFailsWith<ConflictException> { service.delete(alice, mission.id) }
        publisher.get()

        assertTrue(thrown.message!!.contains("published"))
        assertEquals(mission.id, missions.find(mission.id)!!.id)
    }
}
