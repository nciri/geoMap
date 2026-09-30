package geomap.server

import geomap.server.mission.BBox
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.GZIPOutputStream
import kotlin.random.Random

// Header, metadata and tile-data section of a PMTiles v3 archive; the tiles are random bytes the server never decodes.
object TestPmtiles {
    fun build(
        tileType: Int = 1,
        bounds: BBox = BBox(2.0, 48.0, 3.0, 49.0),
        attribution: String? = "© OpenStreetMap",
        size: Int = 4096,
        seed: Int = 1,
        gzipMetadata: Boolean = true,
    ): ByteArray {
        val json = attribution?.let { """{"name":"test","attribution":${quote(it)}}""" } ?: """{"name":"test"}"""
        val metadata = if (gzipMetadata) gzip(json.toByteArray()) else json.toByteArray()
        val header = ByteBuffer.allocate(127).order(ByteOrder.LITTLE_ENDIAN)
        header.put("PMTiles".toByteArray(Charsets.US_ASCII)).put(3)
        header.putLong(8, 127L + metadata.size).putLong(16, 0)
        header.putLong(24, 127).putLong(32, metadata.size.toLong())
        val tileDataOffset = 127L + metadata.size
        header.putLong(56, tileDataOffset).putLong(64, maxOf(0, size - tileDataOffset))
        header.put(97, if (gzipMetadata) 2 else 1).put(98, 1).put(99, tileType.toByte())
        header.putInt(102, (bounds.minLon * 1e7).toInt()).putInt(106, (bounds.minLat * 1e7).toInt())
        header.putInt(110, (bounds.maxLon * 1e7).toInt()).putInt(114, (bounds.maxLat * 1e7).toInt())
        return header.array() + metadata + Random(seed).nextBytes(maxOf(0, size - tileDataOffset.toInt()))
    }

    private fun quote(text: String) = "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

    private fun gzip(bytes: ByteArray): ByteArray =
        ByteArrayOutputStream().also { out -> GZIPOutputStream(out).use { it.write(bytes) } }.toByteArray()
}
