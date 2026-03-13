import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Deck } from '../../entities/deck.entity';
import { Sermon } from '../../entities/sermon.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { Slide } from '../../entities/slide.entity';
import { SlideTemplate } from '../../entities/slide-template.entity';
import { DecksController } from './decks.controller';
import { DecksService } from './decks.service';
import { DeckGenerationProcessor } from './deck-generation.processor';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Deck, Sermon, BrandTheme, Slide, SlideTemplate]),
    BullModule.registerQueue({
      name: 'deck-generation',
    }),
    BullModule.registerQueue({
      name: 'image-generation',
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: configService.get('JWT_EXPIRES_IN') || '7d' },
      }),
    }),
    LlmModule,
  ],
  controllers: [DecksController],
  providers: [DecksService, DeckGenerationProcessor],
  exports: [DecksService],
})
export class DecksModule {}
