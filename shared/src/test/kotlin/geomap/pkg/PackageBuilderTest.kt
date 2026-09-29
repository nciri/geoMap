package geomap.pkg

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class PackageBuilderTest {
    private val header =
        MissionHeader(
            missionId = "m-1",
            version = 2,
            createdAt = Instant.parse("2026-09-25T08:00:00Z"),
            validUntil = Instant.parse("2026-10-02T00:00:00Z"),
            basemap = BasemapRef("zone-nord", "aa"),
        )
    private val payload = MissionPayload(mapOf(ZoomBand.LOW to "{}"), emptyMap(), "Mission test")
    private val recipients =
        listOf(
            RecipientKey("cert-a", TestKeys.rsa.public),
            RecipientKey("cert-b", TestKeys.rsaOther.public),
        )

    private fun build() = PackageBuilder(TestKeys.ec.private).build(header, payload, recipients)

    @Test
    fun `writes the header into the manifest`() {
        val manifest = ManifestJson.decode(GmpContainer.decode(build()).manifest)
        assertEquals("m-1", manifest.missionId)
        assertEquals(2, manifest.version)
        assertEquals("2026-09-25T08:00:00Z", manifest.createdAt)
        assertEquals("2026-10-02T00:00:00Z", manifest.validUntil)
        assertEquals(BasemapRef("zone-nord", "aa"), manifest.basemap)
        assertEquals(Aes.ALG, manifest.payload.alg)
    }

    @Test
    fun `signs the package with the server key`() {
        val container = GmpContainer.decode(build())
        assertTrue(Ecdsa.verify(container.signedPart, container.signature, TestKeys.ec.public))
    }

    @Test
    fun `records the payload hash`() {
        val container = GmpContainer.decode(build())
        assertEquals(Sha256.hex(container.payload), ManifestJson.decode(container.manifest).payload.sha256)
    }

    @Test
    fun `every recipient can decrypt the payload`() {
        val container = GmpContainer.decode(build())
        val manifest = ManifestJson.decode(container.manifest)
        val privateKeys = mapOf("cert-a" to TestKeys.rsa.private, "cert-b" to TestKeys.rsaOther.private)
        assertEquals(2, manifest.recipients.size)
        manifest.recipients.forEach { recipient ->
            assertEquals(RsaOaep.ALG, recipient.alg)
            val key = SoftwareKeyUnwrapper(privateKeys.getValue(recipient.deviceCertSha256)).unwrap(unb64(recipient.wrappedKey))
            val plain = Aes.decrypt(key, unb64(manifest.payload.iv), container.payload, PackageBuilder.aad("m-1", 2))
            assertEquals("Mission test", PayloadCodec.decode(plain).summary)
        }
    }

    @Test
    fun `refuses a package without recipients`() {
        assertFailsWith<IllegalArgumentException> {
            PackageBuilder(TestKeys.ec.private).build(header, payload, emptyList())
        }
    }

    @Test
    fun `refuses more recipients than fit in the manifest limit`() {
        // One RSA key reused under many distinct cert hashes keeps RSA wrapping fast.
        val manyRecipients = (0 until 50).map { RecipientKey("cert-$it", TestKeys.rsa.public) }
        assertFailsWith<IllegalArgumentException> {
            PackageBuilder(TestKeys.ec.private, maxManifestBytes = 1024).build(header, payload, manyRecipients)
        }
    }

    @Test
    fun `refuses duplicate recipients`() {
        val duplicated = listOf(RecipientKey("cert-a", TestKeys.rsa.public), RecipientKey("cert-a", TestKeys.rsaOther.public))
        assertFailsWith<IllegalArgumentException> {
            PackageBuilder(TestKeys.ec.private).build(header, payload, duplicated)
        }
    }
}
