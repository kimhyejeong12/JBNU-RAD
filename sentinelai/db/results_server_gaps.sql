ALTER TABLE server_findings ADD COLUMN gaps TEXT NOT NULL DEFAULT '[]';
ALTER TABLE server_findings ADD COLUMN unjudged TEXT NOT NULL DEFAULT '[]';
