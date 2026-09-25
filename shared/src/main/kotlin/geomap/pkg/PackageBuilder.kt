package geomap.pkg

import java.security.PrivateKey
import java.security.PublicKey
import java.time.Instant

data class MissionHeader(
    val missionId: String,
    val version: Int,
    val createdAt: Instant,
    val validUntil: Instant,
    val basemap: BasemapRef,
)

data class RecipientKey(
    val deviceCertSha256: String,
    val encryptionKey: PublicKey,
)

class PackageBuilder(
    private val signingKey: PrivateKey,
    private val maxManifestBytes: Int = GmpContainer.MAX_MANIFEST,
) {
    fun build(
        header: MissionHeader,
        payload: MissionPayload,
        recipients: List<RecipientKey>,
    ): ByteArray {
        require(recipients.isNotEmpty()) { "a package needs at least one recipient" }
        require(recipients.map { it.deviceCertSha256 }.distinct().size == recipients.size) {
            "duplicate deviceCertSha256 among recipients"
        }
        val uncompressedSize =
            payload.features.values.sumOf { it.encodeToByteArray().size.toLong() } +
                payload.icons.values.sumOf { it.size.toLong() } +
                payload.summary.encodeToByteArray().size.toLong()
        require(uncompressedSize <= PayloadCodec.MAX_UNCOMPRESSED) {
            "payload exceeds the device's uncompressed size limit"
        }
        val key = Aes.newKey()
        val iv = Aes.newIv()
        val ciphertext = Aes.encrypt(key, iv, PayloadCodec.encode(payload), aad(header.missionId, header.version))
        require(ciphertext.size <= GmpContainer.MAX_PAYLOAD) { "payload exceeds the device's package size limit" }
        val manifest =
            Manifest(
                missionId = header.missionId,
                version = header.version,
                createdAt = header.createdAt.toString(),
                validUntil = header.validUntil.toString(),
                basemap = header.basemap,
                payload = PayloadInfo(alg = Aes.ALG, iv = b64(iv), sha256 = Sha256.hex(ciphertext)),
                recipients =
                    recipients.map {
                        Recipient(it.deviceCertSha256, RsaOaep.ALG, b64(RsaOaep.wrap(key, it.encryptionKey)))
                    },
            )
        val encodedManifest = ManifestJson.encode(manifest)
        require(encodedManifest.size <= maxManifestBytes) { "manifest exceeds the device's manifest size limit" }
        val unsigned = GmpContainer.encodeUnsigned(encodedManifest, ciphertext)
        return GmpContainer.appendSignature(unsigned, Ecdsa.sign(unsigned, signingKey))
    }

    companion object {
        // Binds the ciphertext to its mission and version, so a payload cannot be replayed under another header.
        fun aad(
            missionId: String,
            version: Int,
        ): ByteArray = "$missionId:$version".encodeToByteArray()
    }
}
