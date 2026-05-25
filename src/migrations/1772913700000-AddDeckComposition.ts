import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeckComposition1772913700000 implements MigrationInterface {
    name = 'AddDeckComposition1772913700000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "decks" ADD "composition" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "decks" DROP COLUMN "composition"`);
    }
}

