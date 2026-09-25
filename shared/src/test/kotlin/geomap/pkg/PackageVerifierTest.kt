package geomap.pkg

import java.security.PrivateKey
import java.security.PublicKey
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class PackageVerifierTest {
    private val header =
        MissionHeader(
            missionId = "m-1",
            version = 2,
            createdAt = Instant.parse("2026-09-25T08:00:00Z"),
            validUntil = Instant.parse("2026-10-02T00:00:00Z"),
            basemap = BasemapRef("zone-nord", "aa"),
        )
    private val payload = MissionPayload(mapOf(ZoomBand.LOW to "{}"), emptyMap(), "Mission test")
    private val packageBytes =
        PackageBuilder(TestKeys.ec.private).build(
            header,
            payload,
            listOf(RecipientKey("cert-a", TestKeys.rsa.public), RecipientKey("cert-b", TestKeys.rsaOther.public)),
        )

    private fun context(
        now: Instant = Instant.parse("2026-09-26T00:00:00Z"),
        installed: Int? = null,
        hasBasemap: Boolean = true,
        cert: String = "cert-a",
        privateKey: PrivateKey = TestKeys.rsa.private,
        serverKey: PublicKey = TestKeys.ec.public,
    ) = VerifyContext(cert, SoftwareKeyUnwrapper(privateKey), serverKey, now, { installed }, { hasBasemap })

    private fun reasonOf(
        bytes: ByteArray,
        context: VerifyContext,
    ): Rejection = assertIs<VerifyResult.Rejected>(PackageVerifier.verify(bytes, context)).reason

    private fun flipped(index: Int) = packageBytes.copyOf().also { it[index] = (it[index].toInt() xor 1).toByte() }

    @Test
    fun `accepts a valid package`() {
        val accepted = assertIs<VerifyResult.Accepted>(PackageVerifier.verify(packageBytes, context()))
        assertEquals("m-1", accepted.manifest.missionId)
        assertEquals("Mission test", accepted.payload.summary)
    }

    @Test
    fun `every recipient can open the package`() {
        assertIs<VerifyResult.Accepted>(
            PackageVerifier.verify(packageBytes, context(cert = "cert-b", privateKey = TestKeys.rsaOther.private)),
        )
    }

    @Test
    fun `rejects a truncated file as malformed`() {
        assertEquals(Rejection.MALFORMED, reasonOf(packageBytes.copyOf(packageBytes.size - 10), context()))
    }

    @Test
    fun `rejects one altered byte in manifest, payload or signature`() {
        val container = GmpContainer.decode(packageBytes)
        val insideManifest = 8 + container.manifest.size / 2
        val insidePayload = 8 + container.manifest.size + 4 + container.payload.size / 2
        val lastSignatureByte = packageBytes.size - 1
        listOf(insideManifest, insidePayload, lastSignatureByte).forEach { index ->
            assertEquals(Rejection.BAD_SIGNATURE, reasonOf(flipped(index), context()), "byte $index")
        }
    }

    @Test
    fun `rejects a package signed by another server`() {
        assertEquals(Rejection.BAD_SIGNATURE, reasonOf(packageBytes, context(serverKey = TestKeys.ecOther.public)))
    }

    @Test
    fun `counts validUntil itself as expired`() {
        assertEquals(Rejection.EXPIRED, reasonOf(packageBytes, context(now = header.validUntil)))
    }

    @Test
    fun `rejects the same version imported twice`() {
        assertEquals(Rejection.NOT_NEWER, reasonOf(packageBytes, context(installed = 2)))
    }

    @Test
    fun `accepts a newer version`() {
        assertIs<VerifyResult.Accepted>(PackageVerifier.verify(packageBytes, context(installed = 1)))
    }

    @Test
    fun `rejects a device that is not a recipient`() {
        assertEquals(Rejection.NOT_A_RECIPIENT, reasonOf(packageBytes, context(cert = "cert-z")))
    }

    @Test
    fun `reports a missing basemap`() {
        assertEquals(Rejection.BASEMAP_MISSING, reasonOf(packageBytes, context(hasBasemap = false)))
    }

    @Test
    fun `reports corruption when the key cannot be unwrapped`() {
        assertEquals(Rejection.CORRUPTED, reasonOf(packageBytes, context(privateKey = TestKeys.rsaOther.private)))
    }
}
