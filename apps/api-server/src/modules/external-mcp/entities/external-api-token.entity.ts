import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../shared/entities/base-entity.entity';
import { User } from '../../user/entities/user.entity';

@Entity('external_api_tokens')
export class ExternalApiToken extends BaseEntity {
  constructor({ id, ...data }: Partial<ExternalApiToken> = {}, options = { generateId: false }) {
    super(id, options);
    Object.assign(this, { ...data });
  }

  @Index()
  @Column({ type: 'uuid', nullable: false })
  user_id: string;

  @Column({ type: 'varchar', nullable: false })
  token_hash: string;

  @Index()
  @Column({ type: 'varchar', length: 16, nullable: false })
  token_prefix: string;

  @Column({ type: 'varchar', array: true, nullable: false, default: '{}' })
  scopes: string[];

  @Column({ type: 'varchar', nullable: true })
  label?: string;

  @Column({ type: 'varchar', nullable: true })
  agent_name?: string;

  @Column({ type: 'timestamptz', nullable: true })
  last_used_at?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expires_at?: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
