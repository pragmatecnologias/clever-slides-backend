import { Injectable } from '@nestjs/common';
import { Sermon } from '../../entities/sermon.entity';
import { DeckIntentKey, DeckSizeKey, DeckComposition, VisualStyleKey } from '../../../../../shared/deck-composition.contract';
import { SermonUnderstandingService } from './sermon-understanding.service';
import { VisualStyleService } from './visual-style.service';
import { DeckCompositionPlanner } from './deck-composition-planner.service';
import { ImagePromptAssignmentService } from './image-prompt-assignment.service';
import { DeckQualityValidator } from './deck-quality-validator.service';

@Injectable()
export class SermonDeckComposerService {
  constructor(
    private readonly understandingService: SermonUnderstandingService,
    private readonly visualStyleService: VisualStyleService,
    private readonly planner: DeckCompositionPlanner,
    private readonly imagePromptAssignmentService: ImagePromptAssignmentService,
    private readonly qualityValidator: DeckQualityValidator,
  ) {}

  composeDeck(
    sermon: Sermon,
    deckIntent: DeckIntentKey,
    deckSize: DeckSizeKey,
    requestedVisualStyle: VisualStyleKey = 'auto',
    source?: { sermonId?: string; workspaceId?: string; themeId?: string },
  ): DeckComposition {
    const understanding = this.understandingService.analyze(sermon, requestedVisualStyle);
    const style = this.visualStyleService.resolveStyle(sermon, understanding, requestedVisualStyle);
    const planned = this.planner.plan(sermon, deckIntent, understanding, style, deckSize, source);
    const withPrompts = this.imagePromptAssignmentService.assign(planned, understanding, style);
    return this.qualityValidator.validate(withPrompts, understanding, style);
  }
}

