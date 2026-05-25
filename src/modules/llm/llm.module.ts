import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmClient } from './llm-client.service';
import { DeckGenerationService } from './deck-generation.service';
import { SimpleDeckGenerationService } from './simple-deck-generation.service';
import { SermonUnderstandingService } from '../composition/sermon-understanding.service';
import { VisualStyleService } from '../composition/visual-style.service';
import { DeckCompositionPlanner } from '../composition/deck-composition-planner.service';
import { ImagePromptAssignmentService } from '../composition/image-prompt-assignment.service';
import { DeckQualityValidator } from '../composition/deck-quality-validator.service';
import { SermonDeckComposerService } from '../composition/sermon-deck-composer.service';
import { TypographyService } from '../composition/typography.service';

@Module({
  imports: [ConfigModule],
  providers: [
    LlmClient,
    DeckGenerationService,
    SimpleDeckGenerationService,
    SermonUnderstandingService,
    VisualStyleService,
    DeckCompositionPlanner,
    ImagePromptAssignmentService,
    DeckQualityValidator,
    SermonDeckComposerService,
    TypographyService,
  ],
  exports: [
    LlmClient,
    DeckGenerationService,
    SimpleDeckGenerationService,
    SermonUnderstandingService,
    VisualStyleService,
    DeckCompositionPlanner,
    ImagePromptAssignmentService,
    DeckQualityValidator,
    SermonDeckComposerService,
    TypographyService,
  ],
})
export class LlmModule {}
