import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplatePack } from '../../entities/template-pack.entity';
import { SlideTemplate } from '../../entities/slide-template.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { UserRole } from '../../entities/user.entity';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(TemplatePack)
    private packRepository: Repository<TemplatePack>,
    @InjectRepository(SlideTemplate)
    private templateRepository: Repository<SlideTemplate>,
    @InjectRepository(BrandTheme)
    private themeRepository: Repository<BrandTheme>,
  ) {}

  async listPacks() {
    return this.packRepository.find({ order: { createdAt: 'ASC' } });
  }

  async listTemplatesByPack(packId: string) {
    const pack = await this.packRepository.findOne({ where: { id: packId } });
    if (!pack) {
      throw new NotFoundException('Template pack not found');
    }
    const templates = await this.templateRepository.find({
      where: { packId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return { pack, templates };
  }

  async listTemplatesByTheme(themeId: string, churchId: string) {
    const theme = await this.themeRepository.findOne({ where: { id: themeId, churchId } });
    if (!theme) {
      throw new NotFoundException('Theme not found');
    }
    if (!theme.defaultTemplatePackId) {
      return { pack: null, templates: [] };
    }
    return this.listTemplatesByPack(theme.defaultTemplatePackId);
  }

  async updateTemplate(
    id: string,
    updateData: UpdateTemplateDto,
    actor: { role?: string },
  ) {
    if (actor?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can edit templates');
    }

    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    const payload: Partial<SlideTemplate> = {
      ...(updateData.name !== undefined ? { name: updateData.name } : {}),
      ...(updateData.layoutKey !== undefined ? { layoutKey: updateData.layoutKey } : {}),
      ...(updateData.sortOrder !== undefined ? { sortOrder: updateData.sortOrder } : {}),
      ...(updateData.supportsImage !== undefined ? { supportsImage: updateData.supportsImage } : {}),
      ...(updateData.fields !== undefined ? { fields: updateData.fields } : {}),
      ...(updateData.styleDefaults !== undefined ? { styleDefaults: updateData.styleDefaults } : {}),
      ...(updateData.fieldStyleDefaults !== undefined
        ? { fieldStyleDefaults: updateData.fieldStyleDefaults }
        : {}),
    };

    Object.assign(template, payload);
    return this.templateRepository.save(template);
  }
}
