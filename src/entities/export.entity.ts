import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Deck } from './deck.entity';

export enum ExportType {
  PPTX = 'pptx',
  PDF = 'pdf',
}

export enum ExportStatus {
  QUEUED = 'queued',
  RENDERING = 'rendering',
  READY = 'ready',
  FAILED = 'failed',
}

@Entity('exports')
export class Export {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  deckId: string;

  @Column({
    type: 'enum',
    enum: ExportType,
  })
  type: ExportType;

  @Column({
    type: 'enum',
    enum: ExportStatus,
    default: ExportStatus.QUEUED,
  })
  status: ExportStatus;

  @Column({ nullable: true })
  fileUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Deck, deck => deck.exports)
  @JoinColumn({ name: 'deckId' })
  deck: Deck;
}
