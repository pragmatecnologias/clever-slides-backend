import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';

@Injectable()
export class ThemesService {
  constructor(
    @InjectRepository(BrandTheme)
    private themeRepository: Repository<BrandTheme>,
  ) {}

  async create(createThemeDto: CreateThemeDto, churchId: string) {
    // If setting as default, unset other defaults
    if (createThemeDto.isDefault) {
      await this.themeRepository.update(
        { churchId, isDefault: true },
        { isDefault: false },
      );
    }

    const theme = this.themeRepository.create({
      ...createThemeDto,
      churchId,
    });
    return this.themeRepository.save(theme);
  }

  async findAll(churchId: string) {
    return this.themeRepository.find({
      where: { churchId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, churchId: string) {
    const theme = await this.themeRepository.findOne({
      where: { id, churchId },
    });

    if (!theme) {
      throw new NotFoundException('Theme not found');
    }

    return theme;
  }

  async update(id: string, updateThemeDto: UpdateThemeDto, churchId: string) {
    const theme = await this.findOne(id, churchId);
    
    // If setting as default, unset other defaults
    if (updateThemeDto.isDefault) {
      await this.themeRepository.update(
        { churchId, isDefault: true },
        { isDefault: false },
      );
    }
    
    Object.assign(theme, updateThemeDto);
    return this.themeRepository.save(theme);
  }

  async remove(id: string, churchId: string) {
    const theme = await this.findOne(id, churchId);
    await this.themeRepository.remove(theme);
    return { deleted: true };
  }
}
