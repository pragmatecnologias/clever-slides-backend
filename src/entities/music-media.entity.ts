import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Sermon } from './sermon.entity';

export enum MusicStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('music_media')
export class MusicMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  sermonId: string;

  @Column({ nullable: true })
  workspaceId: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ nullable: true })
  genre: string;

  @Column({ nullable: true })
  durationSeconds: number;

  @Column({ default: 'suno' })
  provider: string;

  @Column({
    type: 'enum',
    enum: MusicStatus,
    default: MusicStatus.PENDING,
  })
  status: MusicStatus;

  @Column({ nullable: true })
  filePath: string;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Sermon, sermon => sermon.musicMedia, { nullable: true })
  @JoinColumn({ name: 'sermonId' })
  sermon: Sermon;
}
