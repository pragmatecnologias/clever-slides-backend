import { SermonSlideCopywriterService } from './sermon-slide-copywriter.service';
import { SlideCopyQualityValidator } from './slide-copy-quality-validator.service';
import { DeckCompositionPlanner } from './deck-composition-planner.service';
import { Sermon } from '../../entities/sermon.entity';
import { SermonUnderstanding } from '../../../../../shared/deck-composition.contract';

function makeUnderstanding(overrides: Partial<SermonUnderstanding> = {}): SermonUnderstanding {
  return {
    centralMessage: 'God orders the steps and upholds the stumble.',
    emotionalTone: 'hopeful',
    sermonMovement: 'narrative',
    audienceNeed: 'People need assurance that grace still meets them.',
    pastoralGoal: 'Help the congregation trust God and respond faithfully.',
    appealDirection: 'Respond with faith and hope.',
    visualMotifs: ['open Bible', 'warm light'],
    avoidVisuals: ['doom imagery'],
    recommendedVisualStyle: 'warm_pastoral',
    ...overrides,
  };
}

function makeSermon(overrides: Partial<Sermon> = {}): Sermon {
  return {
    id: 'sermon-1',
    churchId: 'church-1',
    createdByUserId: 'user-1',
    title: 'Held by His Hand',
    seriesTitle: '',
    date: new Date('2026-05-25'),
    mainScriptureRef: 'Psalm 37:23-24',
    bigIdea: 'God orders the steps and upholds the stumble.',
    mainPoints: [],
    audienceContext: 'Congregation needs hope after failure.',
    tone: 'hopeful' as any,
    ctaStyle: 'invitation' as any,
    notes: '',
    outline: {
      structure: {
        pointNodes: [
          {
            title: 'Guidance',
            summary: 'The Lord orders the believer’s steps.',
            supportingVerses: ['Psalm 37:23'],
            applications: ['Ask God for today’s step.'],
          },
          {
            title: 'Stumbling',
            summary: 'The righteous may still fall.',
            supportingVerses: ['Psalm 37:24'],
            applications: ['Stop calling a stumble rejection.'],
          },
        ],
      },
    },
    manuscript: null,
    applications: [],
    questions: [],
    workspaceId: 'workspace-1',
    planning: { language: 'en', ministryMode: 'evangelistic', appealStyle: 'invitation' },
    source: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
    church: undefined as any,
    createdBy: undefined as any,
    decks: [],
    audioMedia: [],
    musicMedia: [],
    videoMedia: [],
    ...overrides,
  } as Sermon;
}

describe('SermonSlideCopywriterService', () => {
  const service = new SermonSlideCopywriterService();
  const validator = new SlideCopyQualityValidator();
  const planner = new DeckCompositionPlanner(service, validator);

  it('builds a strong Psalm 37 sermon deck plan', () => {
    const sermon = makeSermon();
    const plans = service.writeDeckPlan(sermon, 'sermon_presentation', 'standard', makeUnderstanding({ sermonMovement: 'teaching' }));

    expect(plans).toHaveLength(10);
    expect(plans[0].headline).toMatch(/Held by His Hand/i);
    expect(plans.some((slide) => /upholds the stumble/i.test(slide.headline))).toBe(true);
    expect(plans.some((slide) => /Walk\. Trust\. Rise again\./i.test(slide.headline))).toBe(true);
    expect(plans.every((slide) => slide.speakerNotes.length >= 40)).toBe(true);
  });

  it('builds Luke 15 with multiple sermon-shaped moments', () => {
    const sermon = makeSermon({
      title: 'The Father Still Runs',
      mainScriptureRef: 'Luke 15:11-24',
      bigIdea: 'Grace restores the one who comes home.',
    });
    const plans = service.writeDeckPlan(sermon, 'sermon_presentation', 'standard', makeUnderstanding({ sermonMovement: 'narrative', centralMessage: 'Grace restores the one who comes home.' }));

    expect(plans.length).toBeGreaterThanOrEqual(9);
    expect(plans.some((slide) => /Father restores before the son can repay/i.test(slide.headline))).toBe(true);
    expect(plans.some((slide) => /Grace turns shame into celebration/i.test(slide.headline))).toBe(true);
    expect(plans.some((slide) => /Come home honestly/i.test(slide.bodyLines.join(' ')))).toBe(true);
  });

  it('builds Revelation 14 with gospel, worship, Babylon, and endurance', () => {
    const sermon = makeSermon({
      title: 'The Gospel Still Calls',
      mainScriptureRef: 'Revelation 14:6-12',
      bigIdea: 'God’s final worldwide appeal begins with the everlasting gospel.',
    });
    const plans = service.writeDeckPlan(sermon, 'sermon_presentation', 'standard', makeUnderstanding({
      sermonMovement: 'prophetic',
      centralMessage: 'God’s final worldwide appeal begins with the everlasting gospel.',
      recommendedVisualStyle: 'hopeful_prophecy',
    }));

    expect(plans.some((slide) => /everlasting gospel/i.test(slide.headline))).toBe(true);
    expect(plans.some((slide) => /Creator/i.test(slide.headline))).toBe(true);
    expect(plans.some((slide) => /Babylon/i.test(slide.headline))).toBe(true);
    expect(plans.some((slide) => /saints endure/i.test(slide.headline))).toBe(true);
  });

  it('planner keeps layout variety for a 10-slide deck', () => {
    const sermon = makeSermon();
    const understanding = makeUnderstanding({ sermonMovement: 'teaching' });
    const composition = planner.plan(
      sermon,
      'sermon_presentation',
      understanding,
      {
        key: 'warm_pastoral',
        label: 'Warm Pastoral',
        palette: ['#fff'],
        fontPack: 'warm_pastoral' as any,
        typography: { heading: 'Playfair Display', body: 'Inter' },
        backgroundPolicy: 'warm',
        imageStyle: 'warm',
        slideDensity: 'medium',
        socialCardStyle: 'warm',
        prophecyRules: [],
        decorativeStyle: 'soft',
      },
      'standard',
    );

    const layouts = new Set(composition.slides.map((slide) => slide.layoutKey));
    expect(layouts.size).toBeGreaterThanOrEqual(5);
    for (let index = 2; index < composition.slides.length; index += 1) {
      expect(
        !(composition.slides[index].layoutKey === composition.slides[index - 1].layoutKey
          && composition.slides[index].layoutKey === composition.slides[index - 2].layoutKey),
      ).toBe(true);
    }
  });
});
