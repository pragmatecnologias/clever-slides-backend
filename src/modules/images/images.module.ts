import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Slide } from '../../entities/slide.entity';
import { ImageMedia } from '../../entities/image-media.entity';
import { ImagesService } from './images.service';
import { ImagesController } from './images.controller';
import { ImagesMediaController } from './images-media.controller';
import { ImageGenerationProcessor } from './image-generation.processor';
import { LocalImageProvider } from './providers/local-image.provider';
import { OpenAiImageProvider } from './providers/openai-image.provider';
import { FalAiImageProvider } from './providers/falai-image.provider';
import { ImagesEventsService } from './images-events.service';
import { ImagesEventsController } from './images-events.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Slide, ImageMedia]),
    BullModule.registerQueue({ name: 'image-generation' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [ImagesController, ImagesMediaController, ImagesEventsController],
  providers: [ImagesService, ImageGenerationProcessor, LocalImageProvider, OpenAiImageProvider, FalAiImageProvider, ImagesEventsService],
  exports: [ImagesService, ImagesEventsService, LocalImageProvider, OpenAiImageProvider, FalAiImageProvider],
})
export class ImagesModule {}
