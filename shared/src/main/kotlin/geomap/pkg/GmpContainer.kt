package geomap.pkg

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException

class GmpContainer(
    val manifest: ByteArray,
    val payload: ByteArray,
    val signature: ByteArray,
    val signedPart: ByteArray,
) {
    companion object {
        private val MAGIC = "GMP1".encodeToByteArray()

        // Bounds allocations when parsing untrusted files; ~1600 RSA-3072 recipients (~649 bytes each).
        internal const val MAX_MANIFEST = 1024 * 1024

        // Bounds allocations when parsing untrusted files.
        internal const val MAX_PAYLOAD = 64 * 1024 * 1024

        // Bounds allocations when parsing untrusted files.
        internal const val MAX_SIGNATURE = 512

        // Check file size against this before reading it into memory.
        const val MAX_FILE_SIZE = 4 + 4 + MAX_MANIFEST + 4 + MAX_PAYLOAD + 2 + MAX_SIGNATURE

        fun encodeUnsigned(
            manifest: ByteArray,
            payload: ByteArray,
        ): ByteArray {
            val out = ByteArrayOutputStream()
            DataOutputStream(out).use {
                it.write(MAGIC)
                it.writeInt(manifest.size)
                it.write(manifest)
                it.writeInt(payload.size)
                it.write(payload)
            }
            return out.toByteArray()
        }

        fun appendSignature(
            unsigned: ByteArray,
            signature: ByteArray,
        ): ByteArray {
            val out = ByteArrayOutputStream()
            DataOutputStream(out).use {
                it.write(unsigned)
                it.writeShort(signature.size)
                it.write(signature)
            }
            return out.toByteArray()
        }

        fun decode(bytes: ByteArray): GmpContainer {
            val input = DataInputStream(ByteArrayInputStream(bytes))
            try {
                val magic = ByteArray(MAGIC.size).also(input::readFully)
                require(magic.contentEquals(MAGIC)) { "bad magic" }
                val manifestLength = input.readInt()
                require(manifestLength in 1..MAX_MANIFEST) { "bad manifest length" }
                require(manifestLength <= input.available()) { "manifest length exceeds available bytes" }
                val manifest = ByteArray(manifestLength).also(input::readFully)
                val payloadLength = input.readInt()
                require(payloadLength in 0..MAX_PAYLOAD) { "bad payload length" }
                require(payloadLength <= input.available()) { "payload length exceeds available bytes" }
                val payload = ByteArray(payloadLength).also(input::readFully)
                val signedLength = MAGIC.size + 4 + manifestLength + 4 + payloadLength
                val signatureLength = input.readUnsignedShort()
                require(signatureLength in 1..MAX_SIGNATURE) { "bad signature length" }
                require(signatureLength <= input.available()) { "signature length exceeds available bytes" }
                val signature = ByteArray(signatureLength).also(input::readFully)
                require(input.read() == -1) { "trailing bytes" }
                return GmpContainer(manifest, payload, signature, bytes.copyOf(signedLength))
            } catch (e: EOFException) {
                throw IllegalArgumentException("truncated package", e)
            }
        }
    }
}
