package geomap.pkg

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

enum class ZoomBand(
    val entryName: String,
) {
    LOW("features/z0-10.geojson"),
    MID("features/z11-14.geojson"),
    HIGH("features/z15-22.geojson"),
}

data class MissionPayload(
    val features: Map<ZoomBand, String>,
    val icons: Map<String, ByteArray>,
    val summary: String,
)

object PayloadCodec {
    const val EMPTY_FEATURE_COLLECTION = """{"type":"FeatureCollection","features":[]}"""
    const val MAX_UNCOMPRESSED: Long = 64L * 1024 * 1024
    private const val SUMMARY = "summary.md"
    private val ICON_NAME = Regex("^[0-9a-f]{64}\\.png$")

    fun encode(payload: MissionPayload): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            ZoomBand.entries.forEach { band ->
                zip.put(band.entryName, (payload.features[band] ?: EMPTY_FEATURE_COLLECTION).encodeToByteArray())
            }
            payload.icons.toSortedMap().forEach { (name, bytes) ->
                require(ICON_NAME.matches(name)) { "invalid icon name" }
                zip.put("icons/$name", bytes)
            }
            zip.put(SUMMARY, payload.summary.encodeToByteArray())
        }
        return out.toByteArray()
    }

    fun decode(
        bytes: ByteArray,
        maxUncompressed: Long = MAX_UNCOMPRESSED,
    ): MissionPayload {
        val features = mutableMapOf<ZoomBand, String>()
        val icons = mutableMapOf<String, ByteArray>()
        var summary: String? = null
        var remaining = maxUncompressed
        try {
            ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    val data = zip.readAtMost(remaining)
                    remaining -= data.size
                    val band = ZoomBand.entries.find { it.entryName == entry.name }
                    val iconName = entry.name.removePrefix("icons/")
                    when {
                        band != null -> features[band] = data.decodeToString()
                        entry.name.startsWith("icons/") && ICON_NAME.matches(iconName) -> icons[iconName] = data
                        entry.name == SUMMARY -> summary = data.decodeToString()
                        else -> throw IllegalArgumentException("unexpected entry")
                    }
                }
            }
        } catch (e: IOException) {
            throw IllegalArgumentException("invalid archive", e)
        }
        require(features.keys == ZoomBand.entries.toSet()) { "missing zoom band" }
        return MissionPayload(features, icons, summary ?: throw IllegalArgumentException("missing summary"))
    }

    private fun ZipOutputStream.put(
        name: String,
        bytes: ByteArray,
    ) {
        putNextEntry(ZipEntry(name))
        write(bytes)
        closeEntry()
    }

    private fun InputStream.readAtMost(limit: Long): ByteArray {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val read = read(buffer)
            if (read < 0) break
            require(out.size() + read <= limit) { "archive too large" }
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }
}
