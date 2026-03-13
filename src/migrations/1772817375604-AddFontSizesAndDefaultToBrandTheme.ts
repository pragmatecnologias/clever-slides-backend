import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFontSizesAndDefaultToBrandTheme1772817375604 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "brand_themes" 
            ADD COLUMN "headingFontSize" integer DEFAULT 48,
            ADD COLUMN "bodyFontSize" integer DEFAULT 24,
            ADD COLUMN "titleFontSize" integer DEFAULT 64,
            ADD COLUMN "isDefault" boolean DEFAULT false
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "brand_themes" 
            DROP COLUMN "headingFontSize",
            DROP COLUMN "bodyFontSize",
            DROP COLUMN "titleFontSize",
            DROP COLUMN "isDefault"
        `);
    }

}
