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
import org.springframework.stereotype.Service
import java.io.InputStream
import java.security.DigestInputStream
import java.security.MessageDigest
import java.time.Clock

@Service
class BasemapService(
    private val basemaps: BasemapRepository,
    private val store: ObjectStore,
    private val signingKey: ServerSigningKey,
    private val audit: AuditRepository,
    private val clock: Clock,
) {
    fun list(): List<Basemap> = basemaps.findAll()

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
        // ponytail: check-then-write race between two admins uploading the same id; the primary key rejects the second row.
        if (basemaps.find(id) != null) throw ConflictException("basemap $id already exists")

        val digest = MessageDigest.getInstance("SHA-256")
        store.put(objectKey(id), DigestInputStream(content, digest), size, "application/vnd.pmtiles")
        val sha256 = digest.digest()
        // Same scheme as shared BasemapSignature: ECDSA over the file's SHA-256 digest.
        val now = clock.instant()
        val basemap = Basemap(id, trimmed, size, sha256.toHex(), b64(Ecdsa.sign(sha256, signingKey.privateKey)), actor.user, now)
        basemaps.insert(basemap)
        audit.record(AuditEvent(now, actor.user, actor.agent, "basemap.upload", "basemap:$id", mapOf("sizeBytes" to size)))
        return basemap
    }

    companion object {
        private val ID = Regex("^[a-z0-9-]{1,64}$")

        fun objectKey(id: String) = "basemaps/$id.pmtiles"
    }
}
