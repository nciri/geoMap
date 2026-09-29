package geomap.pkg

import java.nio.file.Path
import java.security.PrivateKey
import java.security.PublicKey

// The signature is ECDSA over the file's SHA-256 digest (spec §6.1).
object BasemapSignature {
    fun sign(
        file: Path,
        key: PrivateKey,
    ): ByteArray = Ecdsa.sign(Sha256.bytesOf(file), key)

    // Throws java.nio.file.NoSuchFileException for a missing file.
    fun verify(
        file: Path,
        signature: ByteArray,
        key: PublicKey,
    ): Boolean = Ecdsa.verify(Sha256.bytesOf(file), signature, key)
}
