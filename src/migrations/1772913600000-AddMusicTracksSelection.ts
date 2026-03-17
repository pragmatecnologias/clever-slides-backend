import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMusicTracksSelection1772913600000 implements MigrationInterface {
  name = 'AddMusicTracksSelection1772913600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "music_media" ADD "tracks" jsonb`);
    await queryRunner.query(`ALTER TABLE "music_media" ADD "selectedTrackId" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "music_media" DROP COLUMN "selectedTrackId"`);
    await queryRunner.query(`ALTER TABLE "music_media" DROP COLUMN "tracks"`);
  }
}
