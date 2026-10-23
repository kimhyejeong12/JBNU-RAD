ALTER TABLE monitor_runs ADD COLUMN stage TEXT NOT NULL DEFAULT 'final' CHECK (stage IN ('final', 'fast'));
CREATE INDEX monitor_runs_stage ON monitor_runs (stage, last_event_at);
