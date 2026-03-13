# Pastor Decks - Backend API

AI-powered sermon slide deck generation for pastors. This NestJS backend provides REST APIs for creating sermons, generating slide decks with AI, and exporting to PowerPoint.

## Features

- **Authentication**: JWT-based auth with role-based access control (Admin, Pastor, Editor)
- **Sermon Management**: Create and manage sermon content with structured fields
- **AI Deck Generation**: Automatically generate slide decks from sermon content using LLM
- **Slide Editing**: Full CRUD operations on individual slides with reordering
- **Theme Management**: Customizable branding with logos, colors, and fonts
- **Export**: Generate PowerPoint (PPTX) files from decks
- **Async Processing**: Background jobs for deck generation and exports using BullMQ

## Tech Stack

- **Framework**: NestJS
- **Database**: PostgreSQL with TypeORM
- **Queue**: BullMQ + Redis
- **AI**: LM Studio (local) or OpenAI API
- **Export**: pptxgenjs for PowerPoint generation
- **Auth**: JWT with Passport

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- LM Studio (for local AI) or OpenAI API key

## Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
```

## Environment Variables

```env
NODE_ENV=development
PORT=3001

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=pastor_decks

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# LLM
LM_STUDIO_URL=http://localhost:1234/v1
OPENAI_API_KEY=

# Storage
STORAGE_TYPE=local
STORAGE_PATH=./uploads
```

## Database Setup

```bash
# Create database
createdb pastor_decks

# Run migrations (if using migrations)
npm run migration:run

# Or use synchronize in development (already enabled)
npm run start:dev
```

## Running the Application

```bash
# Development
npm run start:dev

# Production build
npm run build
npm run start:prod
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register new church/admin
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user

### Sermons

- `GET /api/v1/sermons` - List sermons
- `POST /api/v1/sermons` - Create sermon
- `GET /api/v1/sermons/:id` - Get sermon
- `PATCH /api/v1/sermons/:id` - Update sermon
- `DELETE /api/v1/sermons/:id` - Delete sermon

### Decks

- `POST /api/v1/sermons/:sermonId/decks` - Generate deck from sermon
- `GET /api/v1/decks` - List decks
- `GET /api/v1/decks/:id` - Get deck with slides
- `GET /api/v1/decks/:id/slides` - Get deck slides
- `GET /api/v1/decks/:id/status` - Check generation status
- `POST /api/v1/decks/:id/regenerate` - Regenerate deck

### Slides

- `PUT /api/v1/slides/:id` - Update slide content
- `POST /api/v1/decks/:deckId/slides` - Add new slide
- `DELETE /api/v1/slides/:id` - Delete slide
- `POST /api/v1/decks/:deckId/slides/reorder` - Reorder slides

### Themes

- `GET /api/v1/themes` - List themes
- `POST /api/v1/themes` - Create theme
- `GET /api/v1/themes/:id` - Get theme
- `PATCH /api/v1/themes/:id` - Update theme
- `DELETE /api/v1/themes/:id` - Delete theme

### Exports

- `POST /api/v1/decks/:deckId/exports` - Create export (PPTX/PDF)
- `GET /api/v1/decks/:deckId/exports` - List exports for deck
- `GET /api/v1/exports/:id/download` - Download export file

## Architecture

### Modules

- **Auth**: User authentication and authorization
- **Sermons**: Sermon content management
- **Decks**: Deck generation orchestration
- **Slides**: Individual slide CRUD operations
- **Themes**: Branding and theme management
- **Exports**: File export generation
- **LLM**: AI integration for content generation

### Async Processing

Background jobs are processed using BullMQ:

1. **Deck Generation**: Queued when deck is created, generates slides using AI
2. **Export Generation**: Queued when export is requested, creates PPTX/PDF files

### AI Generation

The deck generation service:
1. Analyzes sermon content (title, points, scripture, tone)
2. Determines slide structure based on content
3. Generates slide-ready content for each slide type
4. Enforces short, punchy text (no paragraphs)
5. Falls back to template content if AI fails

Slide types:
- **Title**: Main sermon title + series
- **Scripture**: Reference + key verses
- **Point**: Sermon points with bullets
- **Application**: Practical next steps
- **Invitation**: Call to action

## Development

```bash
# Run tests
npm test

# Run e2e tests
npm run test:e2e

# Lint
npm run lint

# Format
npm run format
```

## Project Structure

```
src/
├── config/           # Configuration files
├── entities/         # TypeORM entities
├── modules/          # Feature modules
│   ├── auth/
│   ├── sermons/
│   ├── decks/
│   ├── slides/
│   ├── themes/
│   ├── exports/
│   └── llm/
├── app.module.ts     # Root module
└── main.ts           # Application entry
```

## License

MIT
