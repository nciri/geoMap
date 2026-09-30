"""Minimal MBTiles writer; `pmtiles convert` turns it into a PMTiles archive."""

import sqlite3


def write(path, metadata, tiles):
    db = sqlite3.connect(path)
    db.executescript(
        "CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT);"
        "CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);"
        "CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row);"
    )
    db.executemany("INSERT INTO metadata VALUES (?, ?)", [(k, str(v)) for k, v in metadata.items()])
    written = 0
    for (z, x, y), data in tiles:
        # MBTiles rows count from the bottom (TMS).
        db.execute("INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?)", (z, x, (2**z - 1) - y, data))
        written += 1
        if written % 500 == 0:
            db.commit()
    db.commit()
    db.close()
    return written
