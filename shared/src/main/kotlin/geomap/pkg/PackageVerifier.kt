package geomap.pkg

import java.security.GeneralSecurityException
import java.security.PublicKey
import java.time.Instant
import java.time.format.DateTimeParseException

enum class Rejection {
    MALFORMED,
    BAD_SIGNATURE,
    EXPIRED,
    NOT_NEWER,
    NOT_A_RECIPIENT,
    BASEMAP_MISSING,
    CORRUPTED,
}

sealed interface VerifyResult {
    data class Accepted(
        val manifest: Manifest,
        val payload: MissionPayload,
    ) : VerifyResult

    data class Rejected(
        val reason: Rejection,
    ) : VerifyResult
}

class VerifyContext(
    /** Lowercase hex SHA-256 of the DER-encoded device certificate, i.e. `Sha256.hex(cert.encoded)`. */
    val deviceCertSha256: String,
    val unwrapper: KeyUnwrapper,
    val serverSigningKey: PublicKey,
    val now: Instant,
    val installedVersion: (missionId: String) -> Int?,
    val hasBasemap: (BasemapRef) -> Boolean,
)

object PackageVerifier {
    fun verify(
        bytes: ByteArray,
        context: VerifyContext,
    ): VerifyResult {
        val container =
            try {
                GmpContainer.decode(bytes)
            } catch (e: IllegalArgumentException) {
                return VerifyResult.Rejected(Rejection.MALFORMED)
            }
        if (!Ecdsa.verify(container.signedPart, container.signature, context.serverSigningKey)) {
            return VerifyResult.Rejected(Rejection.BAD_SIGNATURE)
        }
        val manifest =
            try {
                ManifestJson.decode(container.manifest)
            } catch (e: IllegalArgumentException) {
                return VerifyResult.Rejected(Rejection.MALFORMED)
            }
        if (manifest.format != 1 || manifest.payload.alg != Aes.ALG) {
            return VerifyResult.Rejected(Rejection.MALFORMED)
        }
        val validUntil =
            try {
                Instant.parse(manifest.validUntil)
            } catch (e: DateTimeParseException) {
                return VerifyResult.Rejected(Rejection.MALFORMED)
            }
        if (!context.now.isBefore(validUntil)) return VerifyResult.Rejected(Rejection.EXPIRED)
        val installed = context.installedVersion(manifest.missionId)
        if (installed != null && manifest.version <= installed) return VerifyResult.Rejected(Rejection.NOT_NEWER)
        val recipient =
            manifest.recipients.find { it.deviceCertSha256 == context.deviceCertSha256 && it.alg == RsaOaep.ALG }
                ?: return VerifyResult.Rejected(Rejection.NOT_A_RECIPIENT)
        if (!context.hasBasemap(manifest.basemap)) return VerifyResult.Rejected(Rejection.BASEMAP_MISSING)
        return try {
            val key = context.unwrapper.unwrap(unb64(recipient.wrappedKey))
            val aad = PackageBuilder.aad(manifest.missionId, manifest.version)
            val plaintext = Aes.decrypt(key, unb64(manifest.payload.iv), container.payload, aad)
            VerifyResult.Accepted(manifest, PayloadCodec.decode(plaintext))
        } catch (e: GeneralSecurityException) {
            VerifyResult.Rejected(Rejection.CORRUPTED)
        } catch (e: IllegalArgumentException) {
            VerifyResult.Rejected(Rejection.CORRUPTED)
        } catch (e: RuntimeException) {
            // Keystore providers may throw ProviderException (a RuntimeException) instead of GeneralSecurityException.
            VerifyResult.Rejected(Rejection.CORRUPTED)
        }
    }
}
