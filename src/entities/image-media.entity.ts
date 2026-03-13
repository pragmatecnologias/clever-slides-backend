import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ImageMediaStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('image_media')
export class ImageMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  churchId: string;

  @Column({ nullable: true })
  sermonId: string;

  @Column({ nullable: true })
  workspaceId: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ default: 'local' })
  provider: string;

  @Column({ nullable: true })
  preset: string;

  @Column({
    type: 'enum',
    enum: ImageMediaStatus,
    default: ImageMediaStatus.PENDING,
  })
  status: ImageMediaStatus;

  @Column({ nullable: true })
  filePath: string;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

