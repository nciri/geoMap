package geomap.server.web

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class ApiErrorHandler {
    @ExceptionHandler(InvalidInputException::class)
    fun invalid(e: InvalidInputException): ProblemDetail = problem(HttpStatus.BAD_REQUEST, e)

    @ExceptionHandler(ForbiddenException::class)
    fun forbidden(e: ForbiddenException): ProblemDetail = problem(HttpStatus.FORBIDDEN, e)

    @ExceptionHandler(NotFoundException::class)
    fun notFound(e: NotFoundException): ProblemDetail = problem(HttpStatus.NOT_FOUND, e)

    @ExceptionHandler(ConflictException::class)
    fun conflict(e: ConflictException): ProblemDetail = problem(HttpStatus.CONFLICT, e)

    private fun problem(
        status: HttpStatus,
        e: RuntimeException,
    ): ProblemDetail = ProblemDetail.forStatusAndDetail(status, e.message ?: status.reasonPhrase)
}
