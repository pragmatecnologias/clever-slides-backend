import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sermon } from '../../entities/sermon.entity';
import { Church } from '../../entities/church.entity';
import { User } from '../../entities/user.entity';
import { SermonsController } from './sermons.controller';
import { SermonsService } from './sermons.service';
import { SermonAnalysisService } from './sermon-analysis.service';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sermon, Church, User]),
    LlmModule,
  ],
  controllers: [SermonsController],
  providers: [SermonsService, SermonAnalysisService],
  exports: [SermonsService],
})
export class SermonsModule {}
