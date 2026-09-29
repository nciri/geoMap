CREATE TABLE basemap (
    id         TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,64}$'),
    name       TEXT        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    size_bytes BIGINT      NOT NULL CHECK (size_bytes > 0),
    object_key TEXT        NOT NULL,
    sha256     TEXT        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    signature  TEXT        NOT NULL,
    created_by TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
