import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Sermon } from './sermon.entity';

export enum SocialMediaType {
  QUOTE_GRAPHIC = 'quote_graphic',
  THUMBNAIL = 'thumbnail',
  SHORT_VIDEO = 'short_video',
  INSTAGRAM_POST = 'instagram_post',
  INSTAGRAM_STORY = 'instagram_story',
  FACEBOOK_POST = 'facebook_post',
  WHATSAPP_STATUS = 'whatsapp_status',
  YOUTUBE_THUMBNAIL = 'youtube_thumbnail',
  X_POST = 'x_post',
}

export enum SocialMediaStatus {
  PENDING = 'pending',
  GENERATING = 'generating',
  READY = 'ready',
  FAILED = 'failed',
}

@Entity('social_media')
export class SocialMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  sermonId: string;

  @ManyToOne(() => Sermon, { nullable: true })
  @JoinColumn({ name: 'sermonId' })
  sermon: Sermon;

  @Column({ type: 'uuid', nullable: true })
  workspaceId: string;

  @Column({
    type: 'enum',
    enum: SocialMediaType,
    default: SocialMediaType.QUOTE_GRAPHIC,
  })
  type: SocialMediaType;

  @Column({
    type: 'enum',
    enum: SocialMediaStatus,
    default: SocialMediaStatus.PENDING,
  })
  status: SocialMediaStatus;

  @Column({ type: 'text', nullable: true })
  quote: string;

  @Column({ type: 'text', nullable: true })
  caption: string;

  @Column({ type: 'varchar', nullable: true })
  title: string;

  @Column({ type: 'varchar', nullable: true })
  passage: string;

  @Column({ type: 'varchar', nullable: true })
  filePath: string;

  @Column({ type: 'varchar', nullable: true })
  platform: string;

  @Column({ type: 'varchar', nullable: true })
  variant: string;

  @Column({ type: 'int', nullable: true })
  width: number;

  @Column({ type: 'int', nullable: true })
  height: number;

  @Column({ type: 'varchar', nullable: true, default: 'png' })
  format: string;

  @Column({ type: 'text', nullable: true })
  prompt: string;

  @Column({ type: 'text', nullable: true })
  useCase: string;

  @Column({ type: 'jsonb', nullable: true })
  overlayData: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
