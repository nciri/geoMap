package geomap.pkg

import java.nio.file.Files
import java.nio.file.StandardOpenOption
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BasemapSignatureTest {
    private fun basemapFile() =
        Files.createTempFile("zone-nord", ".pmtiles").also { Files.write(it, ByteArray(200_000) { i -> i.toByte() }) }

    @Test
    fun `verifies a signed basemap`() {
        val file = basemapFile()
        val signature = BasemapSignature.sign(file, TestKeys.ec.private)
        assertTrue(BasemapSignature.verify(file, signature, TestKeys.ec.public))
    }

    @Test
    fun `rejects a modified basemap`() {
        val file = basemapFile()
        val signature = BasemapSignature.sign(file, TestKeys.ec.private)
        Files.write(file, byteArrayOf(9), StandardOpenOption.APPEND)
        assertFalse(BasemapSignature.verify(file, signature, TestKeys.ec.public))
    }

    @Test
    fun `rejects a signature from another server`() {
        val file = basemapFile()
        val signature = BasemapSignature.sign(file, TestKeys.ecOther.private)
        assertFalse(BasemapSignature.verify(file, signature, TestKeys.ec.public))
    }
}
