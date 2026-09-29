package geomap.pkg

import java.nio.file.Files
import java.security.GeneralSecurityException
import javax.crypto.AEADBadTagException
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CryptoTest {
    private val data = "mission".encodeToByteArray()
    private val aad = "m-1:1".encodeToByteArray()

    @Test
    fun `sha256 matches the known vector`() {
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            Sha256.hex("abc".encodeToByteArray()),
        )
    }

    @Test
    fun `sha256 of a file matches sha256 of its bytes`() {
        val file = Files.createTempFile("basemap", ".pmtiles")
        Files.write(file, ByteArray(100_000) { it.toByte() })
        assertEquals(Sha256.hex(Files.readAllBytes(file)), Sha256.bytesOf(file).toHex())
    }

    @Test
    fun `base64 round trips and rejects garbage`() {
        assertContentEquals(data, unb64(b64(data)))
        assertFailsWith<IllegalArgumentException> { unb64("%%%") }
    }

    @Test
    fun `aes round trips`() {
        val key = Aes.newKey()
        val iv = Aes.newIv()
        assertContentEquals(data, Aes.decrypt(key, iv, Aes.encrypt(key, iv, data, aad), aad))
    }

    @Test
    fun `aes detects a tampered ciphertext`() {
        val key = Aes.newKey()
        val iv = Aes.newIv()
        val cipher = Aes.encrypt(key, iv, data, aad)
        cipher[0] = (cipher[0].toInt() xor 1).toByte()
        assertFailsWith<AEADBadTagException> { Aes.decrypt(key, iv, cipher, aad) }
    }

    @Test
    fun `aes detects a different associated data`() {
        val key = Aes.newKey()
        val iv = Aes.newIv()
        val cipher = Aes.encrypt(key, iv, data, aad)
        assertFailsWith<AEADBadTagException> { Aes.decrypt(key, iv, cipher, "m-1:2".encodeToByteArray()) }
    }

    @Test
    fun `rsa oaep wraps and unwraps a key`() {
        val key = Aes.newKey()
        val wrapped = RsaOaep.wrap(key, TestKeys.rsa.public)
        assertContentEquals(key, SoftwareKeyUnwrapper(TestKeys.rsa.private).unwrap(wrapped))
    }

    @Test
    fun `rsa oaep unwrap fails with another private key`() {
        val wrapped = RsaOaep.wrap(Aes.newKey(), TestKeys.rsa.public)
        assertFailsWith<GeneralSecurityException> { SoftwareKeyUnwrapper(TestKeys.rsaOther.private).unwrap(wrapped) }
    }

    @Test
    fun `ecdsa verifies its own signature`() {
        assertTrue(Ecdsa.verify(data, Ecdsa.sign(data, TestKeys.ec.private), TestKeys.ec.public))
    }

    @Test
    fun `ecdsa rejects altered data, another key and garbage`() {
        val signature = Ecdsa.sign(data, TestKeys.ec.private)
        assertFalse(Ecdsa.verify("other".encodeToByteArray(), signature, TestKeys.ec.public))
        assertFalse(Ecdsa.verify(data, signature, TestKeys.ecOther.public))
        assertFalse(Ecdsa.verify(data, byteArrayOf(1, 2, 3), TestKeys.ec.public))
    }

    @Test
    fun `ecdsa rejects malformed DER without throwing`() {
        val signature = Ecdsa.sign(data, TestKeys.ec.private)
        // Truncated signature (missing last byte)
        assertFalse(Ecdsa.verify(data, signature.copyOf(signature.size - 1), TestKeys.ec.public))
        // DER header claiming a longer length than present
        assertFalse(Ecdsa.verify(data, byteArrayOf(0x30, 0x7f, 0x02, 0x01, 0x01), TestKeys.ec.public))
    }
}
