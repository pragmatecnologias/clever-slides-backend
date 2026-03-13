import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Deck } from './deck.entity';
import { AudioMedia } from './audio-media.entity';
import { Sermon } from './sermon.entity';

export enum VideoStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('video_media')
export class VideoMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  deckId: string;

  @Column({ nullable: true })
  audioId: string;

  @Column({ nullable: true })
  sermonId: string;

  @Column({ nullable: true })
  workspaceId: string;

  @Column({
    type: 'enum',
    enum: VideoStatus,
    default: VideoStatus.PENDING,
  })
  status: VideoStatus;

  @Column({ nullable: true })
  filePath: string;

  @Column({ nullable: true })
  durationSeconds: number;

  @Column({ default: '1920x1080' })
  resolution: string;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Deck, { nullable: true })
  @JoinColumn({ name: 'deckId' })
  deck: Deck;

  @ManyToOne(() => AudioMedia, { nullable: true })
  @JoinColumn({ name: 'audioId' })
  audio: AudioMedia;

  @ManyToOne(() => Sermon, sermon => sermon.videoMedia, { nullable: true })
  @JoinColumn({ name: 'sermonId' })
  sermon: Sermon;
}
