import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas } from 'canvas';
import type { CanvasRenderingContext2D } from 'canvas';

@Injectable()
export class LocalImageProvider {
  private storagePath: string;

  constructor(private configService: ConfigService) {
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  async generate(prompt: string, preset?: string): Promise<string> {
    const filename = `image-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const filepath = path.join(this.storagePath, filename);

    const width = 1920;
    const height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const styleKey = (preset || '').toLowerCase();
    if (styleKey === 'cyberpunk') {
      this.drawCyberpunk(ctx, width, height);
    } else if (styleKey === 'worship') {
      this.drawWorship(ctx, width, height);
    } else if (styleKey === 'biblical') {
      this.drawBiblicalScene(ctx, width, height);
    } else if (styleKey === 'modern') {
      this.drawModern(ctx, width, height);
    } else if (styleKey === 'aurora') {
      this.drawAurora(ctx, width, height);
    } else if (styleKey === 'minimal') {
      this.drawMinimal(ctx, width, height);
    } else if (styleKey === 'nature') {
      this.drawNature(ctx, width, height);
    } else if (styleKey === 'abstract') {
      this.drawAbstract(ctx, width, height);
    } else {
      const colors = this.selectColorsFromPrompt(prompt);
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, colors.start);
      gradient.addColorStop(1, colors.end);

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      this.drawNoise(ctx, width, height, 0.04);
    }

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filepath, buffer);
    return filepath;
  }

  private selectColorsFromPrompt(prompt: string): { start: string; end: string } {
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('courage') || lowerPrompt.includes('strength')) {
      return { start: '#1e3a8a', end: '#3b82f6' };
    }
    if (lowerPrompt.includes('peace') || lowerPrompt.includes('calm')) {
      return { start: '#0f766e', end: '#14b8a6' };
    }
    if (lowerPrompt.includes('joy') || lowerPrompt.includes('celebration')) {
      return { start: '#ca8a04', end: '#fbbf24' };
    }
    if (lowerPrompt.includes('hope') || lowerPrompt.includes('light')) {
      return { start: '#7c3aed', end: '#a78bfa' };
    }
    if (lowerPrompt.includes('love') || lowerPrompt.includes('compassion')) {
      return { start: '#be123c', end: '#fb7185' };
    }
    if (lowerPrompt.includes('faith') || lowerPrompt.includes('trust')) {
      return { start: '#0369a1', end: '#38bdf8' };
    }
    if (lowerPrompt.includes('church') || lowerPrompt.includes('worship')) {
      return { start: '#4c1d95', end: '#8b5cf6' };
    }

    return { start: '#1e293b', end: '#475569' };
  }

  private drawCyberpunk(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, '#0f172a');
    base.addColorStop(0.5, '#1e1b4b');
    base.addColorStop(1, '#111827');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.2, height * 0.3, 0, width * 0.2, height * 0.3, width * 0.6);
    glow.addColorStop(0, 'rgba(236, 72, 153, 0.65)');
    glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i += 1) {
      const y = (height / 18) * i + (i % 2 === 0 ? 12 : 0);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y + 8);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    this.drawNoise(ctx, width, height, 0.06);
  }

  private drawModern(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#1f2937');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
    ctx.beginPath();
    ctx.moveTo(width * 0.55, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, height * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(236, 72, 153, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.4);
    ctx.lineTo(width * 0.4, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    this.drawNoise(ctx, width, height, 0.03);
  }

  private drawAurora(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#020617');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const aurora = ctx.createLinearGradient(0, height * 0.2, width, height * 0.9);
    aurora.addColorStop(0, 'rgba(94, 234, 212, 0.45)');
    aurora.addColorStop(0.5, 'rgba(56, 189, 248, 0.35)');
    aurora.addColorStop(1, 'rgba(167, 139, 250, 0.3)');
    ctx.fillStyle = aurora;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.3);
    ctx.bezierCurveTo(width * 0.3, height * 0.1, width * 0.6, height * 0.6, width, height * 0.35);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    this.drawNoise(ctx, width, height, 0.05);
  }

  private drawMinimal(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.beginPath();
    ctx.arc(width * 0.2, height * 0.25, width * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
    ctx.fillRect(width * 0.55, height * 0.1, width * 0.35, height * 0.3);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.fillRect(width * 0.1, height * 0.7, width * 0.5, height * 0.12);
  }

  private drawWorship(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0F172A');
    gradient.addColorStop(0.65, '#111827');
    gradient.addColorStop(1, '#0B1120');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.5, height * 0.28, 0, width * 0.5, height * 0.28, width * 0.52);
    glow.addColorStop(0, 'rgba(253, 224, 71, 0.65)');
    glow.addColorStop(0.45, 'rgba(251, 191, 36, 0.3)');
    glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.65;
    this.drawCross(ctx, width * 0.5, height * 0.24, width * 0.12, height * 0.18, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.9)');
    ctx.globalAlpha = 1;
    this.drawOpenBible(ctx, width * 0.34, height * 0.6, width * 0.32, height * 0.11, 'rgba(255,255,255,0.10)', 'rgba(251, 191, 36, 0.34)');
    this.drawNoise(ctx, width, height, 0.03);
  }

  private drawBiblicalScene(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0F172A');
    sky.addColorStop(0.46, '#1E3A8A');
    sky.addColorStop(1, '#111827');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const horizon = ctx.createLinearGradient(0, height * 0.58, 0, height);
    horizon.addColorStop(0, 'rgba(251, 191, 36, 0.34)');
    horizon.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, height * 0.5, width, height * 0.5);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(width * 0.12, height * 0.72);
    ctx.lineTo(width * 0.34, height * 0.48);
    ctx.lineTo(width * 0.58, height * 0.7);
    ctx.lineTo(width * 0.82, height * 0.44);
    ctx.lineTo(width * 0.9, height * 0.56);
    ctx.lineTo(width * 0.82, height * 0.74);
    ctx.lineTo(width * 0.18, height * 0.74);
    ctx.closePath();
    ctx.fill();

    this.drawOpenBible(ctx, width * 0.39, height * 0.62, width * 0.22, height * 0.09, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.65)');
    this.drawCross(ctx, width * 0.5, height * 0.2, width * 0.08, height * 0.16, 'rgba(255,255,255,0.08)', 'rgba(253, 224, 71, 0.95)');
    this.drawNoise(ctx, width, height, 0.035);
  }

  private drawNature(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#14532d');
    gradient.addColorStop(0.55, '#0f766e');
    gradient.addColorStop(1, '#0F172A');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const sun = ctx.createRadialGradient(width * 0.76, height * 0.26, 0, width * 0.76, height * 0.26, width * 0.16);
    sun.addColorStop(0, 'rgba(253, 224, 71, 0.45)');
    sun.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
    ctx.beginPath();
    ctx.moveTo(width * 0.12, height * 0.78);
    ctx.quadraticCurveTo(width * 0.36, height * 0.5, width * 0.56, height * 0.62);
    ctx.quadraticCurveTo(width * 0.7, height * 0.7, width * 0.88, height * 0.52);
    ctx.lineTo(width * 0.88, height);
    ctx.lineTo(width * 0.12, height);
    ctx.closePath();
    ctx.fill();

    this.drawNoise(ctx, width, height, 0.025);
  }

  private drawCross(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, armWidth: number, armHeight: number, glowColor: string, lineColor: string) {
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(armWidth, armHeight) * 2.2);
    glow.addColorStop(0, glowColor);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(armWidth, armHeight) * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = lineColor;
    ctx.fillRect(centerX - armWidth * 0.15, centerY - armHeight * 0.5, armWidth * 0.3, armHeight);
    ctx.fillRect(centerX - armWidth * 0.6, centerY - armHeight * 0.08, armWidth * 1.2, armHeight * 0.16);
  }

  private drawOpenBible(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, pageColor: string, spineGlow: string) {
    const leftPage = ctx.createLinearGradient(x, y, x + width * 0.5, y + height);
    leftPage.addColorStop(0, pageColor);
    leftPage.addColorStop(1, 'rgba(255,255,255,0.02)');
    const rightPage = ctx.createLinearGradient(x + width * 0.5, y, x + width, y + height);
    rightPage.addColorStop(0, 'rgba(255,255,255,0.02)');
    rightPage.addColorStop(1, pageColor);
    ctx.fillStyle = leftPage;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width * 0.48, y + height * 0.12);
    ctx.lineTo(x + width * 0.45, y + height);
    ctx.lineTo(x, y + height * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rightPage;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.52, y + height * 0.12);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height * 0.92);
    ctx.lineTo(x + width * 0.55, y + height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = spineGlow;
    ctx.fillRect(x + width * 0.48, y + height * 0.02, width * 0.04, height * 0.96);
    this.drawNoise(ctx, width, height, 0.025);
  }

  private drawAbstract(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1d4ed8');
    gradient.addColorStop(0.5, '#7c3aed');
    gradient.addColorStop(1, '#be185d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 10; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.04 + i * 0.01})`;
      ctx.beginPath();
      ctx.ellipse(
        width * Math.random(),
        height * Math.random(),
        width * (0.04 + Math.random() * 0.16),
        height * (0.03 + Math.random() * 0.12),
        Math.random() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    this.drawNoise(ctx, width, height, 0.035);
  }

  private drawNoise(ctx: CanvasRenderingContext2D, width: number, height: number, intensity: number) {
    const imageData = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const rand = (Math.random() - 0.5) * 255 * intensity;
      imageData.data[i] += rand;
      imageData.data[i + 1] += rand;
      imageData.data[i + 2] += rand;
    }
    ctx.putImageData(imageData, 0, 0);
  }
}
