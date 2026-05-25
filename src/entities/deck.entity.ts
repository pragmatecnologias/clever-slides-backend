import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Church } from './church.entity';
import { Sermon } from './sermon.entity';
import { BrandTheme } from './brand-theme.entity';
import { Slide } from './slide.entity';
import { Export } from './export.entity';

export enum DeckStatus {
  DRAFT = 'draft',
  GENERATING = 'generating',
  READY = 'ready',
  EXPORTING = 'exporting',
  EXPORTED = 'exported',
  FAILED = 'failed',
}

export enum DeckIntent {
  SERMON_PRESENTATION = 'sermon_presentation',
  SOCIAL_SUMMARY = 'social_summary',
  TEACHING_STUDY = 'teaching_study',
  YOUTH_MESSAGE = 'youth_message',
  EVANGELISTIC_APPEAL = 'evangelistic_appeal',
}

@Entity('decks')
export class Deck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  churchId: string;

  @Column()
  sermonId: string;

  @Column()
  themeId: string;

  @Column({
    type: 'enum',
    enum: DeckStatus,
    default: DeckStatus.DRAFT,
  })
  status: DeckStatus;

  @Column({ nullable: true })
  generationProvider: string;

  @Column({ nullable: true })
  generationModel: string;

  @Column({ nullable: true })
  templatePackId: string;

  @Column({ type: 'jsonb', nullable: true })
  templatePlan: string[];

  @Column({ type: 'jsonb', nullable: true })
  composition?: Record<string, any>;

  @Column({
    type: 'varchar',
    nullable: false,
    default: DeckIntent.SERMON_PRESENTATION,
  })
  deckIntent: DeckIntent;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Church, church => church.decks)
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @ManyToOne(() => Sermon, sermon => sermon.decks)
  @JoinColumn({ name: 'sermonId' })
  sermon: Sermon;

  @ManyToOne(() => BrandTheme, theme => theme.decks)
  @JoinColumn({ name: 'themeId' })
  theme: BrandTheme;

  @OneToMany(() => Slide, slide => slide.deck, { cascade: true })
  slides: Slide[];

  @OneToMany(() => Export, exportEntity => exportEntity.deck)
  exports: Export[];
}
