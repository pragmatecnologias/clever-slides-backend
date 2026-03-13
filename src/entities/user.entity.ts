import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Church } from './church.entity';
import { Sermon } from './sermon.entity';

export enum UserRole {
  ADMIN = 'admin',
  PASTOR = 'pastor',
  EDITOR = 'editor',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  churchId: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.PASTOR,
  })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Church, church => church.users)
  @JoinColumn({ name: 'churchId' })
  church: Church;

  @OneToMany(() => Sermon, sermon => sermon.createdBy)
  sermons: Sermon[];
}
