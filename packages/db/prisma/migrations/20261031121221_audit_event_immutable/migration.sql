-- The audit trail is append-only (README §12.3, AC-001-07).
-- TRUNCATE remains possible for test resets; production database roles must not hold TRUNCATE on this table.
CREATE OR REPLACE FUNCTION audit_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_immutable
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION audit_event_immutable();
