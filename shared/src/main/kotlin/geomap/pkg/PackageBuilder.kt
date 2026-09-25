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
) {
    fun build(
        header: MissionHeader,
        payload: MissionPayload,
        recipients: List<RecipientKey>,
    ): ByteArray {
        require(recipients.isNotEmpty()) { "a package needs at least one recipient" }
        val key = Aes.newKey()
        val iv = Aes.newIv()
        val ciphertext = Aes.encrypt(key, iv, PayloadCodec.encode(payload), aad(header.missionId, header.version))
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
        val unsigned = GmpContainer.encodeUnsigned(ManifestJson.encode(manifest), ciphertext)
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
