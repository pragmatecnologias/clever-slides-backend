import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmClient } from './llm-client.service';
import { DeckGenerationService } from './deck-generation.service';
import { SimpleDeckGenerationService } from './simple-deck-generation.service';

@Module({
  imports: [ConfigModule],
  providers: [LlmClient, DeckGenerationService, SimpleDeckGenerationService],
  exports: [LlmClient, DeckGenerationService, SimpleDeckGenerationService],
})
export class LlmModule {}
