import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from './modules/auth/auth.module';
import { SermonsModule } from './modules/sermons/sermons.module';
import { DecksModule } from './modules/decks/decks.module';
import { SlidesModule } from './modules/slides/slides.module';
import { ThemesModule } from './modules/themes/themes.module';
import { ExportsModule } from './modules/exports/exports.module';
import { LlmModule } from './modules/llm/llm.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { ImagesModule } from './modules/images/images.module';
import { AudioModule } from './modules/audio/audio.module';
import { MusicModule } from './modules/music/music.module';
import { VideoModule } from './modules/video/video.module';
import { SocialModule } from './modules/social/social.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const rawUrl = configService.get('DATABASE_URL');
        const dbName =
          configService.get('DATABASE_NAME') || configService.get('DB_NAME') || 'pastor_decks';
        let databaseUrl = rawUrl;
        if (rawUrl && dbName) {
          try {
            const parsed = new URL(rawUrl);
            if (!parsed.pathname || parsed.pathname === '/') {
              parsed.pathname = `/${dbName}`;
              databaseUrl = parsed.toString();
            }
          } catch {
            databaseUrl = rawUrl;
          }
        }

        const syncEnabled = configService.get('TYPEORM_SYNC') === 'true';

        return {
          type: 'postgres',
          url: databaseUrl,
          host: databaseUrl ? undefined : configService.get('DATABASE_HOST'),
          port: databaseUrl
            ? undefined
            : parseInt(configService.get('DATABASE_PORT') || '5432', 10),
          username: databaseUrl ? undefined : configService.get('DATABASE_USER'),
          password: databaseUrl ? undefined : configService.get('DATABASE_PASSWORD'),
          database: databaseUrl
            ? undefined
            : configService.get('DATABASE_NAME') || configService.get('DB_NAME') || 'pastor_decks',
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: syncEnabled,
        };
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('REDIS_PORT') || 6379,
        },
      }),
    }),
    AuthModule,
    SermonsModule,
    DecksModule,
    SlidesModule,
    ThemesModule,
    ExportsModule,
    LlmModule,
    TemplatesModule,
    ImagesModule,
    AudioModule,
    MusicModule,
    VideoModule,
    SocialModule,
  ],
})
export class AppModule {}
