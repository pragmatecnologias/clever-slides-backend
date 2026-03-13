import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Sermon } from './sermon.entity';

export enum AudioStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('audio_media')
export class AudioMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  sermonId: string;

  @Column({ nullable: true })
  workspaceId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ nullable: true })
  voiceId: string;

  @Column({ default: 'elevenlabs' })
  provider: string;

  @Column({
    type: 'enum',
    enum: AudioStatus,
    default: AudioStatus.PENDING,
  })
  status: AudioStatus;

  @Column({ nullable: true })
  filePath: string;

  @Column({ nullable: true })
  durationSeconds: number;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Sermon, sermon => sermon.audioMedia, { nullable: true })
  @JoinColumn({ name: 'sermonId' })
  sermon: Sermon;
}
