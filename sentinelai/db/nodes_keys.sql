CREATE UNIQUE INDEX nodes_key ON nodes (key_hash) WHERE key_hash IS NOT NULL;
