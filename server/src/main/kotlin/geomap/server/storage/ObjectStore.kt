package geomap.server.storage

import io.minio.BucketExistsArgs
import io.minio.GetObjectArgs
import io.minio.MakeBucketArgs
import io.minio.MinioClient
import io.minio.PutObjectArgs
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component
import java.io.InputStream

@ConfigurationProperties("geomap.storage")
data class StorageProperties(
    val endpoint: String,
    val accessKey: String,
    val secretKey: String,
    val bucket: String,
) {
    // spec 7.3: logs never contain keys - keep the MinIO secret key out of toString().
    override fun toString() = "StorageProperties(endpoint=$endpoint, accessKey=$accessKey, bucket=$bucket, secretKey=***)"
}

@Component
class ObjectStore(
    private val props: StorageProperties,
) {
    private val client =
        MinioClient
            .builder()
            .endpoint(props.endpoint)
            .credentials(props.accessKey, props.secretKey)
            .build()

    @Volatile
    private var bucketReady = false

    fun put(
        key: String,
        content: InputStream,
        size: Long,
        contentType: String,
    ) {
        ensureBucket()
        client.putObject(
            PutObjectArgs
                .builder()
                .bucket(props.bucket)
                .`object`(key)
                .stream(content, size, -1L)
                .contentType(contentType)
                .build(),
        )
    }

    fun get(key: String): InputStream =
        client.getObject(
            GetObjectArgs
                .builder()
                .bucket(props.bucket)
                .`object`(key)
                .build(),
        )

    fun getRange(
        key: String,
        offset: Long,
        length: Long,
    ): InputStream =
        client.getObject(
            GetObjectArgs
                .builder()
                .bucket(props.bucket)
                .`object`(key)
                .offset(offset)
                .length(length)
                .build(),
        )

    // ALIAS may pre-provision the bucket; create it lazily so startup does not depend on MinIO being up.
    private fun ensureBucket() {
        if (bucketReady) return
        synchronized(this) {
            if (bucketReady) return
            if (!client.bucketExists(BucketExistsArgs.builder().bucket(props.bucket).build())) {
                client.makeBucket(MakeBucketArgs.builder().bucket(props.bucket).build())
            }
            bucketReady = true
        }
    }
}
