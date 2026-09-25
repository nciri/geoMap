package geomap.server.web

class InvalidInputException(
    message: String,
    cause: Throwable? = null,
) : RuntimeException(message, cause)

class NotFoundException(
    message: String,
) : RuntimeException(message)

class ConflictException(
    message: String,
) : RuntimeException(message)

class ForbiddenException(
    message: String,
) : RuntimeException(message)
