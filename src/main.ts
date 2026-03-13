import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const allowedOrigins = [frontendUrl, 'http://127.0.0.1:3000'];

  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  
  app.setGlobalPrefix('api/v1');

  // OpenAPI/Swagger setup for API discovery
  const config = new DocumentBuilder()
    .setTitle('Clever Slides API')
    .setDescription('API for slide generation and deck export')
    .setVersion('1.0')
    .addTag('decks', 'Deck management')
    .addTag('slides', 'Slide generation')
    .addTag('templates', 'Slide templates')
    .addTag('themes', 'Visual themes')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
  
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Clever Slides API running on http://localhost:${port}`);
  console.log(`📚 OpenAPI docs at http://localhost:${port}/api-docs`);
  console.log(`📄 OpenAPI JSON at http://localhost:${port}/api-docs-json`);
}

bootstrap();
