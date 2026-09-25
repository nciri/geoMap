package geomap.pkg

import java.nio.file.Path
import java.security.PrivateKey
import java.security.PublicKey

object BasemapSignature {
    fun sign(
        file: Path,
        key: PrivateKey,
    ): ByteArray = Ecdsa.sign(Sha256.bytesOf(file), key)

    fun verify(
        file: Path,
        signature: ByteArray,
        key: PublicKey,
    ): Boolean = Ecdsa.verify(Sha256.bytesOf(file), signature, key)
}
