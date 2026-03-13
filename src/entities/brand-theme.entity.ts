import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Church } from './church.entity';
import { Deck } from './deck.entity';

@Entity('brand_themes')
export class BrandTheme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  churchId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ nullable: true })
  primaryColor: string;

  @Column({ nullable: true })
  secondaryColor: string;

  @Column({ nullable: true })
  backgroundStyle: string;

  @Column({ nullable: true })
  fontHeading: string;

  @Column({ nullable: true })
  fontBody: string;

  @Column({ nullable: true, default: 48 })
  headingFontSize: number;

  @Column({ nullable: true, default: 24 })
  bodyFontSize: number;

  @Column({ nullable: true, default: 64 })
  titleFontSize: number;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ nullable: true })
  defaultTemplatePackId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Church, church => church.themes)
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @OneToMany(() => Deck, deck => deck.theme)
  decks: Deck[];
}
