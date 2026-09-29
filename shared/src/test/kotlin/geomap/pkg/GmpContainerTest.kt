package geomap.pkg

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertFailsWith

class GmpContainerTest {
    private val manifest = """{"format":1}""".encodeToByteArray()
    private val payload = ByteArray(300) { it.toByte() }
    private val signature = ByteArray(70) { 7 }
    private val unsigned = GmpContainer.encodeUnsigned(manifest, payload)
    private val encoded = GmpContainer.appendSignature(unsigned, signature)

    @Test
    fun `round trips all parts`() {
        val decoded = GmpContainer.decode(encoded)
        assertContentEquals(manifest, decoded.manifest)
        assertContentEquals(payload, decoded.payload)
        assertContentEquals(signature, decoded.signature)
        assertContentEquals(unsigned, decoded.signedPart)
    }

    @Test
    fun `rejects a wrong magic`() {
        val bad = encoded.copyOf().also { it[0] = 'X'.code.toByte() }
        assertFailsWith<IllegalArgumentException> { GmpContainer.decode(bad) }
    }

    @Test
    fun `rejects every truncation`() {
        for (length in 0 until encoded.size) {
            assertFailsWith<IllegalArgumentException>("length $length") { GmpContainer.decode(encoded.copyOf(length)) }
        }
    }

    @Test
    fun `rejects trailing bytes`() {
        assertFailsWith<IllegalArgumentException> { GmpContainer.decode(encoded + byteArrayOf(0)) }
    }

    @Test
    fun `rejects an oversized manifest length`() {
        val out = ByteArrayOutputStream()
        DataOutputStream(out).use {
            it.write("GMP1".encodeToByteArray())
            it.writeInt(Int.MAX_VALUE)
        }
        assertFailsWith<IllegalArgumentException> { GmpContainer.decode(out.toByteArray()) }
    }

    @Test
    fun `rejects a payload length larger than the bytes actually present, without allocating it`() {
        val out = ByteArrayOutputStream()
        DataOutputStream(out).use {
            it.write("GMP1".encodeToByteArray())
            it.writeInt(manifest.size)
            it.write(manifest)
            it.writeInt(64 * 1024 * 1024)
            it.write(byteArrayOf(1, 2, 3))
        }
        assertFailsWith<IllegalArgumentException> { GmpContainer.decode(out.toByteArray()) }
    }
}
