import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { Church } from '../entities/church.entity';
import { User, UserRole } from '../entities/user.entity';
import { BrandTheme } from '../entities/brand-theme.entity';
import { Sermon, SermonTone, CtaStyle } from '../entities/sermon.entity';
import { Deck, DeckStatus } from '../entities/deck.entity';
import { Slide } from '../entities/slide.entity';
import { SlideType } from '../entities/slide-types';
import { Export, ExportStatus, ExportType } from '../entities/export.entity';
import { TemplatePack } from '../entities/template-pack.entity';
import { SlideTemplate } from '../entities/slide-template.entity';
import typeormDataSource from '../config/typeorm.config';
import { defaultTemplatePack, defaultSlideTemplates } from '../modules/templates/template-seed.data';

config();

const dataSource = typeormDataSource as DataSource;
async function seed() {
  await dataSource.initialize();

  const fullReset = process.env.SEED_RESET_FULL === 'true';
  const preserveAuth = !fullReset;

  if (preserveAuth) {
    await dataSource.query(
      `TRUNCATE TABLE
        social_media,
        video_media,
        music_media,
        audio_media,
        exports,
        image_media,
        slides,
        decks,
        sermons,
        brand_themes,
        slide_templates,
        template_packs
      RESTART IDENTITY CASCADE;`,
    );
  } else {
    const dropPath = path.resolve(__dirname, '../../drop_all_tables.sql');
    const dropSql = fs.readFileSync(dropPath, 'utf8');
    await dataSource.query(dropSql);

    const schemaPath = path.resolve(__dirname, '../../schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await dataSource.query(schemaSql);
  }

  const churchRepo = dataSource.getRepository(Church);
  const userRepo = dataSource.getRepository(User);
  const themeRepo = dataSource.getRepository(BrandTheme);
  const sermonRepo = dataSource.getRepository(Sermon);
  const deckRepo = dataSource.getRepository(Deck);
  const slideRepo = dataSource.getRepository(Slide);
  const exportRepo = dataSource.getRepository(Export);
  const packRepo = dataSource.getRepository(TemplatePack);
  const templateRepo = dataSource.getRepository(SlideTemplate);

  const templatePack = packRepo.create(defaultTemplatePack);
  await packRepo.save(templatePack);

  const templates = templateRepo.create(
    defaultSlideTemplates.map((template) => ({
      ...template,
      packId: templatePack.id,
    })),
  );
  await templateRepo.save(templates);

  let church = await churchRepo.findOne({ where: { name: 'Iglesia Adventista Metropolitana de Atlanta' } });
  if (!church) {
    church = churchRepo.create({
      name: 'Iglesia Adventista Metropolitana de Atlanta',
      timezone: 'America/New_York',
    });
    await churchRepo.save(church);
  }

  let admin = await userRepo.findOne({ where: { email: 'admin@gracechurch.com' } });
  if (!admin) {
    const passwordHash = await bcrypt.hash('password123', 10);
    admin = userRepo.create({
      email: 'admin@gracechurch.com',
      passwordHash,
      churchId: church.id,
      role: UserRole.ADMIN,
    });
    await userRepo.save(admin);
  }

  const theme = themeRepo.create({
    churchId: church.id,
    name: 'Default Theme',
    primaryColor: '#1D4ED8',
    secondaryColor: '#F97316',
    fontHeading: 'Playfair Display',
    fontBody: 'Source Sans Pro',
    defaultTemplatePackId: templatePack.id,
  });
  await themeRepo.save(theme);

  const sermon = sermonRepo.create({
    churchId: church.id,
    createdByUserId: admin.id,
    title: 'Living with Courage',
    seriesTitle: 'Faith in Action',
    date: new Date(),
    mainScriptureRef: 'Joshua 1:9',
    bigIdea: 'God gives us courage to take the next step.',
    mainPoints: ['Remember God is with you', 'Stand firm in faith', 'Move forward with confidence'],
    audienceContext: 'Sunday morning service',
    tone: SermonTone.ENCOURAGING,
    ctaStyle: CtaStyle.INVITATION,
    notes: 'Encourage the congregation to trust God in uncertainty.',
  });
  await sermonRepo.save(sermon);

  const deck = deckRepo.create({
    churchId: church.id,
    sermonId: sermon.id,
    themeId: theme.id,
    status: DeckStatus.READY,
    generationProvider: 'seed',
    generationModel: 'manual',
    templatePackId: templatePack.id,
    templatePlan: templates.slice(0, 5).map(t => t.id),
  });
  await deckRepo.save(deck);

  const slides = slideRepo.create([
    {
      deckId: deck.id,
      orderIndex: 0,
      type: SlideType.TITLE,
      layoutKey: 'title_centered_v1',
      templateId: templates.find(t => t.layoutKey === 'title_centered_v1')?.id,
      content: {
        title: sermon.title,
        subtitle: sermon.seriesTitle,
      },
      speakerNotes: 'Welcome everyone and introduce the series.',
    },
    {
      deckId: deck.id,
      orderIndex: 1,
      type: SlideType.SCRIPTURE,
      layoutKey: 'scripture_centered_v1',
      templateId: templates.find(t => t.layoutKey === 'scripture_centered_v1')?.id,
      content: {
        reference: sermon.mainScriptureRef,
        lines: ['Be strong and courageous', 'The Lord is with you wherever you go'],
      },
      speakerNotes: 'Read Joshua 1:9 together.',
    },
    {
      deckId: deck.id,
      orderIndex: 2,
      type: SlideType.POINT,
      layoutKey: 'point_bullets_v1',
      templateId: templates.find(t => t.layoutKey === 'title_content_v1')?.id,
      content: {
        title: '1. Remember God is with you',
        bullets: ['God goes before you', 'His presence calms fear'],
      },
      speakerNotes: 'Share personal story of trust.',
    },
    {
      deckId: deck.id,
      orderIndex: 3,
      type: SlideType.APPLICATION,
      layoutKey: 'application_bullets_v1',
      templateId: templates.find(t => t.layoutKey === 'application_bullets_v1')?.id,
      content: {
        title: 'This Week',
        bullets: ['Pray for courage daily', 'Encourage someone else', 'Take one bold step'],
      },
      speakerNotes: 'Give clear next steps.',
    },
    {
      deckId: deck.id,
      orderIndex: 4,
      type: SlideType.INVITATION,
      layoutKey: 'invitation_centered_v1',
      templateId: templates.find(t => t.layoutKey === 'invitation_centered_v1')?.id,
      content: {
        title: 'Step Forward',
        message: 'God is inviting you into courageous faith today.',
      },
      speakerNotes: 'Invitation time.',
    },
  ]);
  await slideRepo.save(slides);

  const exportEntity = exportRepo.create({
    deckId: deck.id,
    type: ExportType.PPTX,
    status: ExportStatus.READY,
    fileUrl: './uploads/sample-deck.pptx',
  });
  await exportRepo.save(exportEntity);

  const [sermonCount, deckCount, slideCount] = await Promise.all([
    sermonRepo.count(),
    deckRepo.count(),
    slideRepo.count(),
  ]);
  console.log(`Seeded sermons: ${sermonCount}, decks: ${deckCount}, slides: ${slideCount}`);

  await dataSource.destroy();
  console.log('Seed data created successfully.');
}

seed().catch(async (error) => {
  console.error('Seed failed:', error);
  await dataSource.destroy();
  process.exit(1);
});
