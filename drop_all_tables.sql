DO $$ DECLARE
  r RECORD;
BEGIN
  -- Drop tables in public schema without dropping the schema itself
  FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;

  -- Drop enum types created by this app (ignore if missing)
  PERFORM 1;
  BEGIN
    EXECUTE 'DROP TYPE IF EXISTS user_role CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS sermon_tone CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS cta_style CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS deck_status CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS slide_type CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS export_type CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS export_status CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS slide_image_status CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS image_media_status CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS audio_media_status CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS music_media_status CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS video_media_status CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS social_media_type CASCADE';
    EXECUTE 'DROP TYPE IF EXISTS social_media_status CASCADE';
  EXCEPTION WHEN OTHERS THEN
    -- ignore type drop errors
    NULL;
  END;
END $$;
