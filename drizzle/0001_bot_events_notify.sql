-- Every news bot event is announced on the `mappy_bot` channel; the admin panel streams them live.
CREATE OR REPLACE FUNCTION mappy_bot_event_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('mappy_bot', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS bot_events_notify ON bot_events;
--> statement-breakpoint
CREATE TRIGGER bot_events_notify AFTER INSERT ON bot_events FOR EACH ROW EXECUTE FUNCTION mappy_bot_event_notify();
