package geomap.server.basemap

import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.stereotype.Component

// Basemaps uploaded before kinds existed get theirs from the stored file, once, at startup.
@Component
class BasemapBackfill(
    private val service: BasemapService,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) = service.backfill()
}
