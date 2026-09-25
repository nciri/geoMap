package geomap.pkg

import kotlinx.serialization.SerializationException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ManifestJsonTest {
    private val sample =
        Manifest(
            missionId = "m-1",
            version = 3,
            createdAt = "2026-09-25T08:00:00Z",
            validUntil = "2026-10-02T00:00:00Z",
            basemap = BasemapRef(id = "zone-nord", sha256 = "ab"),
            payload = PayloadInfo(alg = "A256GCM", iv = "aXY=", sha256 = "00"),
            recipients = listOf(Recipient(deviceCertSha256 = "cafe", alg = "RSA-OAEP-SHA256-MGF1SHA1", wrappedKey = "a2V5")),
        )

    @Test
    fun `round trips a manifest`() {
        assertEquals(sample, ManifestJson.decode(ManifestJson.encode(sample)))
    }

    @Test
    fun `always writes the format number`() {
        assertTrue(ManifestJson.encode(sample).decodeToString().contains("\"format\":1"))
    }

    @Test
    fun `rejects unknown fields`() {
        val json = ManifestJson.encode(sample).decodeToString().replaceFirst("{", "{\"extra\":1,")
        assertFailsWith<SerializationException> { ManifestJson.decode(json.encodeToByteArray()) }
    }

    @Test
    fun `rejects a manifest missing a field`() {
        val json = """{"format":1,"missionId":"m-1"}"""
        assertFailsWith<SerializationException> { ManifestJson.decode(json.encodeToByteArray()) }
    }
}
