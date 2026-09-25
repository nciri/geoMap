package geomap.server.audit

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.time.Instant

data class AuditEvent(
    val at: Instant,
    val actorUser: String,
    val actorAgent: String?,
    val action: String,
    val target: String,
    val details: Map<String, Any?>,
)

@Repository
class AuditRepository(
    private val jdbc: JdbcClient,
    private val json: ObjectMapper,
) {
    fun record(event: AuditEvent) {
        jdbc
            .sql(
                """
                INSERT INTO audit_event (at, actor_user, actor_agent, action, target, details)
                VALUES (:at, :actorUser, :actorAgent, :action, :target, CAST(:details AS jsonb))
                """.trimIndent(),
            ).param("at", event.at.toUtc())
            .param("actorUser", event.actorUser)
            .param("actorAgent", event.actorAgent)
            .param("action", event.action)
            .param("target", event.target)
            .param("details", json.writeValueAsString(event.details))
            .update()
    }

    @Suppress("UNCHECKED_CAST")
    fun latest(limit: Int): List<AuditEvent> =
        jdbc
            .sql("SELECT * FROM audit_event ORDER BY id DESC LIMIT :limit")
            .param("limit", limit)
            .query { rs, _ ->
                AuditEvent(
                    at = rs.instant("at")!!,
                    actorUser = rs.getString("actor_user"),
                    actorAgent = rs.getString("actor_agent"),
                    action = rs.getString("action"),
                    target = rs.getString("target"),
                    details = json.readValue(rs.getString("details"), Map::class.java) as Map<String, Any?>,
                )
            }.list()
}
