package geomap.server.basemap

import geomap.server.mission.BBox
import tools.jackson.databind.ObjectMapper
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.GZIPInputStream

enum class BasemapKind { VECTOR, RASTER }

data class PmtilesHeader(
    val kind: BasemapKind,
    val bounds: BBox,
    val metadataOffset: Long,
    val metadataLength: Long,
    val internalCompression: Int,
    // Where the last section (root/leaf directories, metadata, tile data) ends: a shorter file is truncated.
    val end: Long,
) {
    companion object {
        const val SIZE = 127
        private val MAGIC = "PMTiles".toByteArray(Charsets.US_ASCII)

        fun parse(bytes: ByteArray): PmtilesHeader? {
            if (bytes.size < SIZE || !bytes.copyOfRange(0, MAGIC.size).contentEquals(MAGIC) || bytes[7].toInt() != 3) return null
            val kind =
                when (bytes[99].toInt()) {
                    1 -> BasemapKind.VECTOR
                    2, 3, 4, 5 -> BasemapKind.RASTER
                    else -> return null
                }
            val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)

            fun degrees(at: Int) = buffer.getInt(at) / 1e7

            // A negative offset or length, or one that overflows, reads as a section ending beyond any file.
            fun sectionEnd(at: Int): Long {
                val (offset, length) = buffer.getLong(at) to buffer.getLong(at + 8)
                return if (offset < 0 || length < 0 || offset + length < 0) Long.MAX_VALUE else offset + length
            }
            return PmtilesHeader(
                kind = kind,
                bounds = BBox(degrees(102), degrees(106), degrees(110), degrees(114)),
                metadataOffset = buffer.getLong(24),
                metadataLength = buffer.getLong(32),
                internalCompression = bytes[97].toInt(),
                end = listOf(8, 24, 40, 56).maxOf(::sectionEnd),
            )
        }

        // Protomaps builds put an HTML link in the attribution; the UI shows plain text.
        fun attribution(
            metadata: ByteArray,
            internalCompression: Int,
            json: ObjectMapper,
        ): String =
            try {
                val raw =
                    when (internalCompression) {
                        1 -> metadata
                        2 -> GZIPInputStream(metadata.inputStream()).use { it.readBytes() }
                        else -> return ""
                    }
                val value = json.readTree(raw).get("attribution")?.asString() ?: ""
                value.replace(Regex("<[^>]*>"), "").trim()
            } catch (e: Exception) {
                ""
            }
    }
}
