package geomap.server.storage

import org.junit.jupiter.api.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class StoragePropertiesTest {
    @Test
    fun `toString does not leak the secret key`() {
        val props = StorageProperties(endpoint = "http://minio:9000", accessKey = "access", secretKey = "super-secret", bucket = "geomap")
        val text = props.toString()
        assertFalse(text.contains("super-secret"))
        assertTrue(text.contains("geomap"))
    }
}
