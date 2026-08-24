-- Existing candidates predate source-host capture; retain a content-free marker
-- rather than deriving or fabricating a host from raw evidence.
ALTER TABLE candidates ADD COLUMN source_host_ids_json TEXT NOT NULL DEFAULT '["legacy-unknown"]';
