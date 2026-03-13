import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { SlideType } from './slide-types';
import { Slide } from './slide.entity';

export type FieldStyle = {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  backgroundColor?: string;
  backgroundOpacity?: number;
};

export type TemplateStyleDefaults = Partial<
  Record<'title' | 'subtitle' | 'body' | 'caption' | 'reference' | 'message', FieldStyle>
>;

@Entity('slide_templates')
export class SlideTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  packId: string;

  @Column()
  name: string;

  @Column()
  layoutKey: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({
    type: 'enum',
    enum: SlideType,
  })
  slideType: SlideType;

  @Column({ type: 'jsonb' })
  fields: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  styleDefaults?: TemplateStyleDefaults;

  @Column({ type: 'jsonb', nullable: true })
  fieldStyleDefaults?: Record<string, FieldStyle>;

  @Column({ default: false })
  supportsImage: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Slide, slide => slide.template)
  slides: Slide[];
}
