import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTemplateStyleDefaults1772822001570 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "slide_templates"
      ADD COLUMN IF NOT EXISTS "styleDefaults" jsonb,
      ADD COLUMN IF NOT EXISTS "fieldStyleDefaults" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "slide_templates"
      DROP COLUMN IF EXISTS "styleDefaults",
      DROP COLUMN IF EXISTS "fieldStyleDefaults"
    `);
  }
}
