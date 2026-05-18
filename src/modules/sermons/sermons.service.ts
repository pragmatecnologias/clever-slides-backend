import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sermon } from '../../entities/sermon.entity';
import { Church } from '../../entities/church.entity';
import { User } from '../../entities/user.entity';
import { CreateSermonDto } from './dto/create-sermon.dto';
import { UpdateSermonDto } from './dto/update-sermon.dto';
import { CreateSermonFromWorkspaceDto } from './dto/create-sermon-from-workspace.dto';
import { SermonAnalysisService } from './sermon-analysis.service';

@Injectable()
export class SermonsService {
  private logger = new Logger(SermonsService.name);

  constructor(
    @InjectRepository(Sermon)
    private sermonRepository: Repository<Sermon>,
    @InjectRepository(Church)
    private churchRepository: Repository<Church>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private sermonAnalysisService: SermonAnalysisService,
  ) {}

  async create(createSermonDto: CreateSermonDto, userId: string, churchId: string) {
    let mainPoints = createSermonDto.mainPoints;

    // If mainPoints are missing or insufficient, use LLM to extract them
    if (!mainPoints || mainPoints.length < 3) {
      this.logger.log(`Analyzing sermon "${createSermonDto.title}" to extract main points`);
      try {
        const analysis = await this.sermonAnalysisService.analyzeSermon(
          createSermonDto.title,
          createSermonDto.bigIdea,
          createSermonDto.notes,
          createSermonDto.mainScriptureRef,
          mainPoints,
        );
        mainPoints = analysis.mainPoints;
        this.logger.log(`Extracted ${mainPoints.length} main points for sermon "${createSermonDto.title}"`);
      } catch (error) {
        this.logger.error(`Failed to analyze sermon: ${error.message}`);
        // Keep original points if analysis fails
      }
    }

    const sermon = this.sermonRepository.create({
      ...createSermonDto,
      mainPoints,
      createdByUserId: userId,
      churchId,
    });
    return this.sermonRepository.save(sermon);
  }

  async findAll(churchId: string) {
    return this.sermonRepository.find({
      where: { churchId },
      order: { createdAt: 'DESC' },
      relations: ['createdBy'],
    });
  }

  async findOne(id: string, churchId: string) {
    const sermon = await this.sermonRepository.findOne({
      where: { id, churchId },
      relations: ['createdBy', 'decks'],
    });

    if (!sermon) {
      throw new NotFoundException('Sermon not found');
    }

    return sermon;
  }

  async update(id: string, updateSermonDto: UpdateSermonDto, churchId: string) {
    const sermon = await this.findOne(id, churchId);
    
    // If updating mainPoints and they are insufficient, use LLM to enhance them
    if (updateSermonDto.mainPoints !== undefined) {
      const mainPoints = updateSermonDto.mainPoints;
      
      if (!mainPoints || mainPoints.length < 3) {
        this.logger.log(`Analyzing updated sermon "${sermon.title}" to extract main points`);
        try {
          const analysis = await this.sermonAnalysisService.analyzeSermon(
            updateSermonDto.title || sermon.title,
            updateSermonDto.bigIdea || sermon.bigIdea,
            updateSermonDto.notes || sermon.notes,
            updateSermonDto.mainScriptureRef || sermon.mainScriptureRef,
            mainPoints,
          );
          updateSermonDto.mainPoints = analysis.mainPoints;
          this.logger.log(`Extracted ${analysis.mainPoints.length} main points for sermon "${sermon.title}"`);
        } catch (error) {
          this.logger.error(`Failed to analyze sermon: ${error.message}`);
        }
      }
    }
    
    Object.assign(sermon, updateSermonDto);
    return this.sermonRepository.save(sermon);
  }

  async remove(id: string, churchId: string) {
    const sermon = await this.findOne(id, churchId);
    await this.sermonRepository.remove(sermon);
    return { deleted: true };
  }

  async createFromWorkspace(dto: CreateSermonFromWorkspaceDto, userId: string, churchId: string) {
    // Ensure church exists (auto-create if syncing from sermon app)
    let church = await this.churchRepository.findOne({ where: { id: churchId } });
    if (!church) {
      this.logger.log(`Auto-creating church record for workspace ${dto.workspaceId}`);
      church = this.churchRepository.create({
        id: churchId,
        name: `Workspace ${dto.workspaceId.substring(0, 8)}`,
        timezone: 'America/New_York',
      });
      try {
        await this.churchRepository.save(church);
      } catch (error) {
        this.logger.warn(
          `Church auto-create race detected for churchId=${churchId}: ${(error as Error)?.message || 'unknown error'}`,
        );
        const existingChurch = await this.churchRepository.findOne({ where: { id: churchId } });
        if (!existingChurch) {
          throw error;
        }
        church = existingChurch;
      }
    }

    // Ensure user exists (auto-create if syncing from sermon app)
    let user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      this.logger.log(`Auto-creating user record for userId ${userId}`);
      user = this.userRepository.create({
        id: userId,
        churchId,
        email: `user-${userId.substring(0, 8)}@workspace.local`,
        passwordHash: 'N/A',
        role: 'pastor' as any,
      });
      try {
        await this.userRepository.save(user);
      } catch (error) {
        this.logger.warn(
          `User auto-create race detected for userId=${userId}: ${(error as Error)?.message || 'unknown error'}`,
        );
        const existingUser = await this.userRepository.findOne({ where: { id: userId } });
        if (!existingUser) {
          throw error;
        }
        user = existingUser;
      }
    }

    // Check if sermon already exists for this workspace
    const existing = await this.sermonRepository.findOne({
      where: { workspaceId: dto.workspaceId, churchId },
    });

    // Handle both scripture and mainScriptureRef field names
    const scriptureRef = dto.mainScriptureRef || dto.scripture;
    const normalizedLanguage = String(dto.language || '').trim().toLowerCase();
    const outlineWithLanguage =
      dto.outline && typeof dto.outline === 'object'
        ? { ...dto.outline, _workspaceLanguage: normalizedLanguage || dto.outline?._workspaceLanguage || 'en' }
        : dto.outline;

    if (existing) {
      // Update existing sermon
      Object.assign(existing, {
        title: dto.title,
        seriesTitle: dto.seriesTitle,
        mainScriptureRef: scriptureRef,
        bigIdea: dto.bigIdea,
        mainPoints: dto.mainPoints,
        audienceContext: dto.audienceContext,
        tone: dto.tone as any,
        notes: dto.notes,
        outline: outlineWithLanguage,
        manuscript: dto.manuscript,
        applications: dto.applications,
        questions: dto.questions,
      });
      await this.sermonRepository.save(existing);
      return existing;
    }

    // Create new sermon from workspace
    const sermon = this.sermonRepository.create({
      workspaceId: dto.workspaceId,
      source: 'sermon_app',
      title: dto.title,
      seriesTitle: dto.seriesTitle,
      mainScriptureRef: scriptureRef,
      bigIdea: dto.bigIdea,
      mainPoints: dto.mainPoints,
      audienceContext: dto.audienceContext,
      tone: dto.tone as any,
      notes: dto.notes,
      outline: outlineWithLanguage,
      manuscript: dto.manuscript,
      applications: dto.applications,
      questions: dto.questions,
      createdByUserId: userId,
      churchId,
    });

    return this.sermonRepository.save(sermon);
  }
}
