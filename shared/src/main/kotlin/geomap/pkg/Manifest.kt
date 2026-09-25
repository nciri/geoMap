package geomap.pkg

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class Manifest(
    val format: Int = 1,
    val missionId: String,
    val version: Int,
    val createdAt: String,
    val validUntil: String,
    val basemap: BasemapRef,
    val payload: PayloadInfo,
    val recipients: List<Recipient>,
)

@Serializable
data class BasemapRef(
    val id: String,
    val sha256: String,
)

@Serializable
data class PayloadInfo(
    val alg: String,
    val iv: String,
    val sha256: String,
)

@Serializable
data class Recipient(
    val deviceCertSha256: String,
    val alg: String,
    val wrappedKey: String,
)

object ManifestJson {
    // Unknown fields are rejected: a newer format must bump `format`, not slip past an old reader.
    private val json = Json { encodeDefaults = true }

    fun encode(manifest: Manifest): ByteArray = json.encodeToString(Manifest.serializer(), manifest).encodeToByteArray()

    fun decode(bytes: ByteArray): Manifest = json.decodeFromString(Manifest.serializer(), bytes.decodeToString())
}
