package geomap.server.db

import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset

fun Instant.toUtc(): OffsetDateTime = atOffset(ZoneOffset.UTC)

fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()
