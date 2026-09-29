CREATE TABLE mission_version (
    id             UUID PRIMARY KEY,
    mission_id     UUID        NOT NULL REFERENCES mission (id) ON DELETE CASCADE,
    number         INT         NOT NULL CHECK (number > 0),
    mission_name   TEXT        NOT NULL,
    basemap_id     TEXT        NOT NULL REFERENCES basemap (id),
    basemap_sha256 TEXT        NOT NULL,
    valid_until    TIMESTAMPTZ NOT NULL,
    snapshot       JSONB       NOT NULL,
    object_key     TEXT        NOT NULL,
    sha256         TEXT        NOT NULL,
    size_bytes     BIGINT      NOT NULL,
    recipients     INT         NOT NULL CHECK (recipients > 0),
    published_by   TEXT        NOT NULL,
    published_at   TIMESTAMPTZ NOT NULL,
    UNIQUE (mission_id, number)
);
