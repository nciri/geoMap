package geomap.server.basemap

import geomap.pkg.Ecdsa
import geomap.pkg.b64
import geomap.pkg.toHex
import geomap.server.audit.AuditEvent
import geomap.server.audit.AuditRepository
import geomap.server.security.Actor
import geomap.server.security.ServerSigningKey
import geomap.server.storage.ObjectStore
import geomap.server.web.ConflictException
import geomap.server.web.ForbiddenException
import geomap.server.web.InvalidInputException
import geomap.server.web.NotFoundException
import org.slf4j.LoggerFactory
import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.io.BufferedInputStream
import java.io.InputStream
import java.security.DigestInputStream
import java.security.MessageDigest
import java.time.Clock
import java.util.UUID

@Service
class BasemapService(
    private val basemaps: BasemapRepository,
    private val store: ObjectStore,
    private val signingKey: ServerSigningKey,
    private val audit: AuditRepository,
    private val clock: Clock,
    private val json: ObjectMapper,
) {
    fun list(): List<Basemap> = basemaps.findAll()

    fun get(id: String): Basemap = basemaps.find(id) ?: throw NotFoundException("basemap not found")

    fun read(
        basemap: Basemap,
        offset: Long,
        length: Long,
    ): InputStream = store.getRange(basemap.objectKey, offset, length)

    fun upload(
        actor: Actor,
        id: String,
        name: String,
        content: InputStream,
        size: Long,
    ): Basemap {
        if (actor.isAgent) throw ForbiddenException("agents cannot register basemaps")
        if (!ID.matches(id)) throw InvalidInputException("basemap id must match ${ID.pattern}")
        val trimmed = name.trim()
        if (trimmed.length !in 1..200) throw InvalidInputException("name must be 1 to 200 characters")
        if (size <= 0) throw InvalidInputException("a non-empty body with a Content-Length is required")
        if (basemaps.find(id) != null) throw ConflictException("basemap $id already exists")

        // Each upload gets its own key: a lost race leaves one orphaned object, never a mismatched row.
        // Only the header is peeked; the rest still streams straight to MinIO.
        val buffered = BufferedInputStream(content)
        buffered.mark(PmtilesHeader.SIZE)
        val header =
            PmtilesHeader
                .parse(buffered.readNBytes(PmtilesHeader.SIZE))
                ?.takeIf { it.end <= size }
                ?: throw InvalidInputException(PmtilesHeader.INVALID)
        buffered.reset()

        val objectKey = "basemaps/$id/${UUID.randomUUID()}.pmtiles"
        val digest = MessageDigest.getInstance("SHA-256")
        store.put(objectKey, DigestInputStream(buffered, digest), size, "application/vnd.pmtiles")
        val sha256 = digest.digest()
        val attribution =
            try {
                describe(objectKey)?.second ?: ""
            } catch (e: Exception) {
                store.remove(objectKey)
                throw e
            }
        // Same scheme as shared BasemapSignature: ECDSA over the file's SHA-256 digest.
        val now = clock.instant()
        val basemap =
            Basemap(
                id,
                trimmed,
                size,
                objectKey,
                sha256.toHex(),
                b64(Ecdsa.sign(sha256, signingKey.privateKey)),
                actor.user,
                now,
                header.kind,
                attribution,
                header.bounds,
            )
        try {
            basemaps.insert(basemap)
        } catch (e: DuplicateKeyException) {
            throw ConflictException("basemap $id already exists")
        }
        audit.record(AuditEvent(now, actor.user, actor.agent, "basemap.upload", "basemap:$id", mapOf("sizeBytes" to size)))
        return basemap
    }

    fun backfill() {
        for (basemap in basemaps.findWithoutBounds()) {
            val description =
                try {
                    describe(basemap.objectKey)
                } catch (e: Exception) {
                    null
                }
            if (description == null) {
                log.warn("basemap {}: header or metadata unreadable, kept as VECTOR", basemap.id)
                continue
            }
            val (header, attribution) = description
            basemaps.updateDescription(basemap.id, header.kind, attribution, header.bounds)
        }
    }

    private fun describe(objectKey: String): Pair<PmtilesHeader, String>? {
        val header =
            store.getRange(objectKey, 0, PmtilesHeader.SIZE.toLong()).use { PmtilesHeader.parse(it.readNBytes(PmtilesHeader.SIZE)) }
                ?: return null
        // Metadata larger than this cannot be an attribution worth reading.
        val attribution =
            if (header.metadataLength in 1..PmtilesHeader.MAX_METADATA) {
                store.getRange(objectKey, header.metadataOffset, header.metadataLength).use {
                    PmtilesHeader.attribution(it.readAllBytes(), header.internalCompression, json)
                }
            } else {
                ""
            }
        return header to attribution
    }

    companion object {
        private val ID = Regex("^[a-z0-9-]{1,64}$")
        private val log = LoggerFactory.getLogger(BasemapService::class.java)
    }
}
