import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Church } from './church.entity';
import { User } from './user.entity';
import { Deck } from './deck.entity';
import { AudioMedia } from './audio-media.entity';
import { MusicMedia } from './music-media.entity';
import { VideoMedia } from './video-media.entity';

export enum SermonTone {
  HOPEFUL = 'hopeful',
  URGENT = 'urgent',
  REFLECTIVE = 'reflective',
  CHALLENGING = 'challenging',
  ENCOURAGING = 'encouraging',
}

export enum CtaStyle {
  SALVATION = 'salvation',
  PRAYER = 'prayer',
  DISCIPLESHIP = 'discipleship',
  INVITATION = 'invitation',
  NONE = 'none',
}

@Entity('sermons')
export class Sermon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  churchId: string;

  @Column()
  createdByUserId: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  seriesTitle: string;

  @Column({ type: 'date', nullable: true })
  date: Date;

  @Column({ nullable: true })
  mainScriptureRef: string;

  @Column({ type: 'text' })
  bigIdea: string;

  @Column({ type: 'simple-array' })
  mainPoints: string[];

  @Column({ type: 'text', nullable: true })
  audienceContext: string;

  @Column({
    type: 'enum',
    enum: SermonTone,
    default: SermonTone.ENCOURAGING,
  })
  tone: SermonTone;

  @Column({
    type: 'enum',
    enum: CtaStyle,
    default: CtaStyle.PRAYER,
  })
  ctaStyle: CtaStyle;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'jsonb', nullable: true })
  outline: any;

  @Column({ type: 'jsonb', nullable: true })
  manuscript: any;

  @Column({ type: 'jsonb', nullable: true })
  applications: any[];

  @Column({ type: 'jsonb', nullable: true })
  questions: any[];

  @Column({ nullable: true })
  workspaceId: string;

  @Column({ default: 'slides_app' })
  source: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Church, church => church.sermons)
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @ManyToOne(() => User, user => user.sermons)
  @JoinColumn({ name: 'createdByUserId' })
  createdBy: User;

  @OneToMany(() => Deck, deck => deck.sermon)
  decks: Deck[];

  @OneToMany(() => AudioMedia, audio => audio.sermon)
  audioMedia: AudioMedia[];

  @OneToMany(() => MusicMedia, music => music.sermon)
  musicMedia: MusicMedia[];

  @OneToMany(() => VideoMedia, video => video.sermon)
  videoMedia: VideoMedia[];
}
