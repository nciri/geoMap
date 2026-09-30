package geomap.server.mission

import geomap.server.IntegrationTest
import geomap.server.audit.AuditEvent
import geomap.server.audit.AuditRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class RepositoryTest : IntegrationTest() {
    @Autowired
    private lateinit var missions: MissionRepository

    @Autowired
    private lateinit var features: FeatureRepository

    @Autowired
    private lateinit var audit: AuditRepository

    // PostgreSQL stores microseconds; truncate so round trips compare equal.
    private val now = Instant.now().truncatedTo(ChronoUnit.MICROS)

    private fun mission(name: String = "Op Nord") =
        Mission(
            id = UUID.randomUUID(),
            name = name,
            status = MissionStatus.DRAFT,
            layers = emptyList(),
            validUntil = null,
            createdBy = "alice",
            updatedBy = "alice",
            createdAt = now,
            updatedAt = now,
        )

    private fun feature(missionId: UUID) =
        Feature(
            id = UUID.randomUUID(),
            missionId = missionId,
            kind = FeatureKind.APP6,
            geometry = mapOf("type" to "LineString", "coordinates" to listOf(listOf(2.5, 48.5), listOf(3.25, 49.75))),
            bbox = BBox(2.5, 48.5, 3.25, 49.75),
            name = "Axe principal",
            description = "",
            style = null,
            sidc = "10031000001211000000",
            modifiers = mapOf("T" to "1ER RI"),
            origin = FeatureOrigin.AI_SUGGESTED,
            suggestionStatus = SuggestionStatus.PENDING,
            createdAt = now,
            updatedAt = now,
        )

    @Test
    fun `round trips a mission with null fields`() {
        val mission = mission()
        missions.insert(mission)
        assertEquals(mission, missions.find(mission.id))
    }

    @Test
    fun `updates a mission`() {
        val mission = mission()
        missions.insert(mission)
        val updated =
            mission.copy(
                name = "Op Sud",
                layers = listOf("zone-sud", "zone-ortho"),
                validUntil = now.plusSeconds(3600),
                updatedBy = "bob",
            )
        missions.update(updated)
        assertEquals(updated, missions.find(mission.id))
    }

    @Test
    fun `returns null for an unknown mission`() {
        assertNull(missions.find(UUID.randomUUID()))
    }

    @Test
    fun `lists missions most recently updated first`() {
        val older = mission("A")
        val newer = mission("B").copy(updatedAt = now.plusSeconds(10))
        missions.insert(older)
        missions.insert(newer)
        assertEquals(listOf(newer.id, older.id), missions.findAll().map { it.id })
    }

    @Test
    fun `round trips a feature with json columns`() {
        val mission = mission()
        missions.insert(mission)
        val feature = feature(mission.id)
        features.insert(feature)
        assertEquals(feature, features.find(mission.id, feature.id))
        assertEquals(listOf(feature), features.findByMission(mission.id))
    }

    @Test
    fun `does not find a feature through another mission`() {
        val mission = mission()
        missions.insert(mission)
        val feature = feature(mission.id)
        features.insert(feature)
        assertNull(features.find(UUID.randomUUID(), feature.id))
    }

    @Test
    fun `deleting a mission deletes its features`() {
        val mission = mission()
        missions.insert(mission)
        features.insert(feature(mission.id))
        missions.delete(mission.id)
        assertEquals(emptyList(), features.findByMission(mission.id))
    }

    @Test
    fun `the schema refuses a human feature with a suggestion status`() {
        val mission = mission()
        missions.insert(mission)
        assertFailsWith<DataIntegrityViolationException> {
            features.insert(feature(mission.id).copy(origin = FeatureOrigin.HUMAN))
        }
    }

    @Test
    fun `returns the latest audit events first`() {
        audit.record(AuditEvent(now, "alice", null, "mission.create", "mission:1", emptyMap()))
        audit.record(AuditEvent(now, "alice", "assistant", "feature.create", "feature:2", mapOf("origin" to "AI_SUGGESTED")))
        val latest = audit.latest(10)
        assertEquals(listOf("feature.create", "mission.create"), latest.map { it.action })
        assertEquals("assistant", latest.first().actorAgent)
        assertEquals(mapOf("origin" to "AI_SUGGESTED"), latest.first().details)
    }
}
