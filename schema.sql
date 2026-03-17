CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'pastor', 'editor');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE sermon_tone AS ENUM ('hopeful', 'urgent', 'reflective', 'challenging', 'encouraging');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE cta_style AS ENUM ('salvation', 'prayer', 'discipleship', 'invitation', 'none');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE deck_status AS ENUM ('draft', 'generating', 'ready', 'exporting', 'exported', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE slide_type AS ENUM (
    'title',
    'scripture',
    'point',
    'support',
    'transition',
    'application',
    'prayer',
    'invitation',
    'announcement'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE export_type AS ENUM ('pptx', 'pdf');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE export_status AS ENUM ('queued', 'rendering', 'ready', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE slide_image_status AS ENUM ('pending', 'ready', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE image_media_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE audio_media_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE music_media_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE video_media_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE social_media_type AS ENUM (
    'quote_graphic',
    'thumbnail',
    'short_video',
    'instagram_post',
    'instagram_story',
    'facebook_post',
    'whatsapp_status',
    'youtube_thumbnail',
    'x_post'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE social_media_status AS ENUM ('pending', 'generating', 'ready', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS churches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  timezone text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_packs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slide_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "packId" uuid NOT NULL REFERENCES template_packs(id) ON DELETE CASCADE,
  name text NOT NULL,
  "layoutKey" text NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "slideType" slide_type NOT NULL,
  fields jsonb NOT NULL,
  "styleDefaults" jsonb,
  "fieldStyleDefaults" jsonb,
  "supportsImage" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "churchId" uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  "passwordHash" text NOT NULL,
  role user_role NOT NULL DEFAULT 'pastor',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brand_themes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "churchId" uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name text NOT NULL,
  "logoUrl" text,
  "primaryColor" text,
  "secondaryColor" text,
  "backgroundStyle" text,
  "fontHeading" text,
  "fontBody" text,
  "headingFontSize" integer DEFAULT 48,
  "bodyFontSize" integer DEFAULT 24,
  "titleFontSize" integer DEFAULT 64,
  "isDefault" boolean NOT NULL DEFAULT false,
  "defaultTemplatePackId" uuid REFERENCES template_packs(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sermons (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "churchId" uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  "createdByUserId" uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  "seriesTitle" text,
  date date,
  "mainScriptureRef" text,
  "bigIdea" text NOT NULL,
  "mainPoints" text NOT NULL,
  "audienceContext" text,
  tone sermon_tone NOT NULL DEFAULT 'encouraging',
  "ctaStyle" cta_style NOT NULL DEFAULT 'prayer',
  notes text,
  outline jsonb,
  manuscript jsonb,
  applications jsonb,
  questions jsonb,
  "workspaceId" text,
  source text NOT NULL DEFAULT 'slides_app',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "churchId" uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  "sermonId" uuid NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  "themeId" uuid NOT NULL REFERENCES brand_themes(id) ON DELETE CASCADE,
  status deck_status NOT NULL DEFAULT 'draft',
  "generationProvider" text,
  "generationModel" text,
  "templatePackId" uuid REFERENCES template_packs(id) ON DELETE SET NULL,
  "templatePlan" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slides (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "deckId" uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  "orderIndex" integer NOT NULL,
  type slide_type NOT NULL,
  "layoutKey" text NOT NULL,
  content jsonb NOT NULL,
  "speakerNotes" text,
  "imagePrompt" text,
  "contentImagePrompt" text,
  "templateId" uuid REFERENCES slide_templates(id) ON DELETE SET NULL,
  "imageUrl" text,
  "imageProvider" text,
  "imageStatus" slide_image_status,
  "contentImageUrl" text,
  "contentImageProvider" text,
  "contentImageStatus" slide_image_status,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS image_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "churchId" uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  "sermonId" uuid REFERENCES sermons(id) ON DELETE CASCADE,
  "workspaceId" text,
  prompt text NOT NULL,
  provider text NOT NULL DEFAULT 'local',
  preset text,
  status image_media_status NOT NULL DEFAULT 'pending',
  "filePath" text,
  "errorMessage" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_media_workspace ON image_media("workspaceId");
CREATE INDEX IF NOT EXISTS idx_image_media_church ON image_media("churchId");
CREATE INDEX IF NOT EXISTS idx_image_media_sermon ON image_media("sermonId");

CREATE TABLE IF NOT EXISTS audio_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "sermonId" uuid REFERENCES sermons(id) ON DELETE CASCADE,
  "workspaceId" text,
  text text NOT NULL,
  "voiceId" varchar,
  provider varchar NOT NULL DEFAULT 'elevenlabs',
  status audio_media_status NOT NULL DEFAULT 'pending',
  "filePath" varchar,
  "durationSeconds" integer,
  "errorMessage" varchar,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_media_workspace ON audio_media("workspaceId");
CREATE INDEX IF NOT EXISTS idx_audio_media_sermon ON audio_media("sermonId");

CREATE TABLE IF NOT EXISTS music_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "sermonId" uuid REFERENCES sermons(id) ON DELETE CASCADE,
  "workspaceId" text,
  prompt text NOT NULL,
  genre varchar,
  "durationSeconds" integer,
  provider varchar NOT NULL DEFAULT 'suno',
  status music_media_status NOT NULL DEFAULT 'pending',
  "filePath" varchar,
  "errorMessage" varchar,
  tracks jsonb,
  "selectedTrackId" varchar,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_music_media_workspace ON music_media("workspaceId");
CREATE INDEX IF NOT EXISTS idx_music_media_sermon ON music_media("sermonId");

CREATE TABLE IF NOT EXISTS video_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "deckId" uuid REFERENCES decks(id) ON DELETE CASCADE,
  "audioId" uuid REFERENCES audio_media(id) ON DELETE SET NULL,
  "sermonId" uuid REFERENCES sermons(id) ON DELETE CASCADE,
  "workspaceId" text,
  status video_media_status NOT NULL DEFAULT 'pending',
  "filePath" varchar,
  "durationSeconds" integer,
  resolution varchar NOT NULL DEFAULT '1920x1080',
  "errorMessage" varchar,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_media_workspace ON video_media("workspaceId");
CREATE INDEX IF NOT EXISTS idx_video_media_sermon ON video_media("sermonId");

CREATE TABLE IF NOT EXISTS social_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "sermonId" uuid REFERENCES sermons(id) ON DELETE CASCADE,
  "workspaceId" text,
  type social_media_type NOT NULL DEFAULT 'quote_graphic',
  status social_media_status NOT NULL DEFAULT 'pending',
  quote text,
  caption text,
  title varchar,
  passage varchar,
  "filePath" varchar,
  platform varchar,
  variant varchar,
  width integer,
  height integer,
  format varchar DEFAULT 'png',
  prompt text,
  "useCase" text,
  "overlayData" jsonb,
  "errorMessage" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_media_workspace ON social_media("workspaceId");
CREATE INDEX IF NOT EXISTS idx_social_media_sermon ON social_media("sermonId");
CREATE INDEX IF NOT EXISTS idx_social_media_status ON social_media(status);

CREATE TABLE IF NOT EXISTS exports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "deckId" uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  type export_type NOT NULL,
  status export_status NOT NULL DEFAULT 'queued',
  "fileUrl" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
