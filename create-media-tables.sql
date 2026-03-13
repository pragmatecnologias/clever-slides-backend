-- Create media tables for slides backend
-- Run this manually: psql -d pastor_decks -f create-media-tables.sql

-- Create audio_media table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audio_media_status') THEN
        CREATE TYPE audio_media_status AS ENUM ('pending', 'processing', 'completed', 'failed');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS audio_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "sermonId" UUID,
    "workspaceId" VARCHAR,
    text TEXT NOT NULL,
    "voiceId" VARCHAR,
    provider VARCHAR NOT NULL DEFAULT 'elevenlabs',
    status audio_media_status NOT NULL DEFAULT 'pending',
    "filePath" VARCHAR,
    "durationSeconds" INTEGER,
    "errorMessage" VARCHAR,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "FK_audio_sermon" FOREIGN KEY ("sermonId") REFERENCES sermons(id) ON DELETE CASCADE
);

-- Create music_media table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'music_media_status') THEN
        CREATE TYPE music_media_status AS ENUM ('pending', 'processing', 'completed', 'failed');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS music_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "sermonId" UUID,
    "workspaceId" VARCHAR,
    prompt TEXT NOT NULL,
    genre VARCHAR,
    "durationSeconds" INTEGER,
    provider VARCHAR NOT NULL DEFAULT 'suno',
    status music_media_status NOT NULL DEFAULT 'pending',
    "filePath" VARCHAR,
    "errorMessage" VARCHAR,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "FK_music_sermon" FOREIGN KEY ("sermonId") REFERENCES sermons(id) ON DELETE CASCADE
);

-- Create video_media table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'video_media_status') THEN
        CREATE TYPE video_media_status AS ENUM ('pending', 'processing', 'completed', 'failed');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS video_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "deckId" UUID,
    "audioId" UUID,
    "sermonId" UUID,
    "workspaceId" VARCHAR,
    status video_media_status NOT NULL DEFAULT 'pending',
    "filePath" VARCHAR,
    "durationSeconds" INTEGER,
    resolution VARCHAR NOT NULL DEFAULT '1920x1080',
    "errorMessage" VARCHAR,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "FK_video_deck" FOREIGN KEY ("deckId") REFERENCES decks(id) ON DELETE CASCADE,
    CONSTRAINT "FK_video_audio" FOREIGN KEY ("audioId") REFERENCES audio_media(id) ON DELETE SET NULL,
    CONSTRAINT "FK_video_sermon" FOREIGN KEY ("sermonId") REFERENCES sermons(id) ON DELETE CASCADE
);

-- Create image_media table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'image_media_status') THEN
        CREATE TYPE image_media_status AS ENUM ('pending', 'processing', 'completed', 'failed');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS image_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "churchId" UUID NOT NULL,
    "sermonId" UUID,
    "workspaceId" TEXT,
    prompt TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'local',
    preset TEXT,
    status image_media_status NOT NULL DEFAULT 'pending',
    "filePath" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "FK_image_media_church" FOREIGN KEY ("churchId") REFERENCES churches(id) ON DELETE CASCADE,
    CONSTRAINT "FK_image_media_sermon" FOREIGN KEY ("sermonId") REFERENCES sermons(id) ON DELETE CASCADE
);

-- Add new columns to sermons table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sermons' AND column_name='workspaceId') THEN
        ALTER TABLE sermons ADD COLUMN "workspaceId" VARCHAR;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sermons' AND column_name='source') THEN
        ALTER TABLE sermons ADD COLUMN source VARCHAR NOT NULL DEFAULT 'slides_app';
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_audio_workspace ON audio_media("workspaceId");
CREATE INDEX IF NOT EXISTS idx_audio_sermon ON audio_media("sermonId");
CREATE INDEX IF NOT EXISTS idx_music_workspace ON music_media("workspaceId");
CREATE INDEX IF NOT EXISTS idx_music_sermon ON music_media("sermonId");
CREATE INDEX IF NOT EXISTS idx_video_workspace ON video_media("workspaceId");
CREATE INDEX IF NOT EXISTS idx_video_sermon ON video_media("sermonId");
CREATE INDEX IF NOT EXISTS idx_image_workspace ON image_media("workspaceId");
CREATE INDEX IF NOT EXISTS idx_image_sermon ON image_media("sermonId");
CREATE INDEX IF NOT EXISTS idx_image_church ON image_media("churchId");
CREATE INDEX IF NOT EXISTS idx_sermon_workspace ON sermons("workspaceId");

-- Create social_media table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_media_type') THEN
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
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_media_status') THEN
        CREATE TYPE social_media_status AS ENUM ('pending', 'generating', 'ready', 'failed');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS social_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "sermonId" UUID,
    "workspaceId" TEXT,
    type social_media_type NOT NULL DEFAULT 'quote_graphic',
    status social_media_status NOT NULL DEFAULT 'pending',
    quote TEXT,
    caption TEXT,
    title VARCHAR,
    passage VARCHAR,
    "filePath" VARCHAR,
    platform VARCHAR,
    variant VARCHAR,
    width INTEGER,
    height INTEGER,
    format VARCHAR DEFAULT 'png',
    prompt TEXT,
    "useCase" TEXT,
    "overlayData" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "FK_social_sermon" FOREIGN KEY ("sermonId") REFERENCES sermons(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_social_workspace ON social_media("workspaceId");
CREATE INDEX IF NOT EXISTS idx_social_sermon ON social_media("sermonId");
CREATE INDEX IF NOT EXISTS idx_social_status ON social_media(status);
