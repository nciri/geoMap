package geomap.pkg

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class PayloadCodecTest {
    private val iconName = "a".repeat(64) + ".png"
    private val payload =
        MissionPayload(
            features =
                mapOf(
                    ZoomBand.LOW to """{"type":"FeatureCollection","features":[{"id":1}]}""",
                    ZoomBand.MID to """{"type":"FeatureCollection","features":[{"id":2}]}""",
                    ZoomBand.HIGH to """{"type":"FeatureCollection","features":[{"id":3}]}""",
                ),
            icons = mapOf(iconName to byteArrayOf(1, 2, 3)),
            summary = "Reconnaissance secteur nord",
        )

    private fun zipOf(vararg entries: Pair<String, ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            entries.forEach { (name, bytes) ->
                zip.putNextEntry(ZipEntry(name))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        return out.toByteArray()
    }

    private val validEntries =
        arrayOf(
            ZoomBand.LOW.entryName to "{}".encodeToByteArray(),
            ZoomBand.MID.entryName to "{}".encodeToByteArray(),
            ZoomBand.HIGH.entryName to "{}".encodeToByteArray(),
            "summary.md" to "s".encodeToByteArray(),
        )

    @Test
    fun `round trips a payload`() {
        val decoded = PayloadCodec.decode(PayloadCodec.encode(payload))
        assertEquals(payload.features, decoded.features)
        assertEquals(payload.summary, decoded.summary)
        assertEquals(setOf(iconName), decoded.icons.keys)
        assertContentEquals(byteArrayOf(1, 2, 3), decoded.icons.getValue(iconName))
    }

    @Test
    fun `fills missing zoom bands with an empty feature collection`() {
        val decoded = PayloadCodec.decode(PayloadCodec.encode(payload.copy(features = mapOf(ZoomBand.LOW to "{}"))))
        assertEquals(PayloadCodec.EMPTY_FEATURE_COLLECTION, decoded.features.getValue(ZoomBand.MID))
    }

    @Test
    fun `refuses to encode an icon with an invalid name`() {
        assertFailsWith<IllegalArgumentException> {
            PayloadCodec.encode(payload.copy(icons = mapOf("../evil.png" to byteArrayOf(1))))
        }
    }

    @Test
    fun `rejects a path traversal entry`() {
        assertFailsWith<IllegalArgumentException> {
            PayloadCodec.decode(zipOf(*validEntries, "../evil" to byteArrayOf(1)))
        }
    }

    @Test
    fun `rejects an unknown entry`() {
        assertFailsWith<IllegalArgumentException> {
            PayloadCodec.decode(zipOf(*validEntries, "notes.txt" to byteArrayOf(1)))
        }
    }

    @Test
    fun `rejects an archive without summary`() {
        assertFailsWith<IllegalArgumentException> {
            PayloadCodec.decode(zipOf(*validEntries.dropLast(1).toTypedArray()))
        }
    }

    @Test
    fun `rejects an archive larger than the limit once uncompressed`() {
        assertFailsWith<IllegalArgumentException> {
            PayloadCodec.decode(PayloadCodec.encode(payload), maxUncompressed = 10)
        }
    }

    @Test
    fun `rejects bytes that are not a zip`() {
        assertFailsWith<IllegalArgumentException> { PayloadCodec.decode(byteArrayOf(1, 2, 3)) }
    }
}
