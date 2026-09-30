ALTER TABLE mission ADD COLUMN layers TEXT[] NOT NULL DEFAULT '{}';
UPDATE mission SET layers = ARRAY[basemap_id] WHERE basemap_id IS NOT NULL;
ALTER TABLE mission DROP COLUMN basemap_id;
