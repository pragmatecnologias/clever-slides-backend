import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { BrandTheme } from './brand-theme.entity';
import { Sermon } from './sermon.entity';
import { Deck } from './deck.entity';

@Entity('churches')
export class Church {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  timezone: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => User, user => user.church)
  users: User[];

  @OneToMany(() => BrandTheme, theme => theme.church)
  themes: BrandTheme[];

  @OneToMany(() => Sermon, sermon => sermon.church)
  sermons: Sermon[];

  @OneToMany(() => Deck, deck => deck.church)
  decks: Deck[];
}
