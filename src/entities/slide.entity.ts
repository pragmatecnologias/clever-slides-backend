import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Deck } from './deck.entity';
import { SlideTemplate } from './slide-template.entity';
import { SlideType } from './slide-types';

export enum SlideImageStatus {
  PENDING = 'pending',
  READY = 'ready',
  FAILED = 'failed',
}

@Entity('slides')
export class Slide {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  deckId: string;

  @Column()
  orderIndex: number;

  @Column({
    type: 'enum',
    enum: SlideType,
  })
  type: SlideType;

  @Column()
  layoutKey: string;

  @Column({ type: 'jsonb' })
  content: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  speakerNotes: string;

  @Column({ nullable: true })
  imagePrompt: string;

  @Column({ nullable: true })
  contentImagePrompt: string;

  @Column({ nullable: true })
  templateId: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  imageProvider: string;

  @Column({
    type: 'enum',
    enum: SlideImageStatus,
    nullable: true,
  })
  imageStatus: SlideImageStatus;

  @Column({ nullable: true })
  contentImageUrl: string;

  @Column({ nullable: true })
  contentImageProvider: string;

  @Column({
    type: 'enum',
    enum: SlideImageStatus,
    nullable: true,
  })
  contentImageStatus: SlideImageStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Deck, deck => deck.slides, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deckId' })
  deck: Deck;

  @ManyToOne(() => SlideTemplate, template => template.slides, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'templateId' })
  template: SlideTemplate;
}
