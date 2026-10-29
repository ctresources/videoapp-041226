-- Whether the Digital Twin was filmed upright (2026-10-29), measured from the
-- training clip when the twin is made. HeyGen reports every twin as 1280x720
-- whatever it was filmed in, so this is the only record of its real shape.
-- Null for twins made before this (treated as upright, which is how twins are
-- filmed). Decides the widescreen Avatar video layout (lib/video/start-render.ts).
-- Not privileged: it only chooses a layout.
alter table public.profiles add column if not exists twin_upright boolean;
