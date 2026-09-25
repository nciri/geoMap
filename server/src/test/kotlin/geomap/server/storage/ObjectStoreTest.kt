package geomap.server.storage

import geomap.server.IntegrationTest
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID
import kotlin.random.Random
import kotlin.test.assertContentEquals
import kotlin.test.assertFails

class ObjectStoreTest : IntegrationTest() {
    @Autowired
    private lateinit var store: ObjectStore

    private fun key() = "test/${UUID.randomUUID()}"

    @Test
    fun `stores and reads back an object`() {
        val bytes = "zone-nord".encodeToByteArray()
        val key = key()
        store.put(key, bytes.inputStream(), bytes.size.toLong(), "application/octet-stream")
        assertContentEquals(bytes, store.get(key).use { it.readBytes() })
    }

    @Test
    fun `streams a multi-megabyte object`() {
        val bytes = Random(42).nextBytes(6 * 1024 * 1024)
        val key = key()
        store.put(key, bytes.inputStream(), bytes.size.toLong(), "application/vnd.pmtiles")
        assertContentEquals(bytes, store.get(key).use { it.readBytes() })
    }

    @Test
    fun `reading a missing object fails`() {
        assertFails { store.get(key()).use { it.readBytes() } }
    }
}
