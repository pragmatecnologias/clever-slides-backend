import { Injectable } from '@nestjs/common';
import { Sermon } from '../../entities/sermon.entity';
import { SermonUnderstanding, VisualStyleKey } from '../../../../../shared/deck-composition.contract';
import { FontPackKey } from './typography.service';

export interface VisualStyleProfile {
  key: VisualStyleKey;
  label: string;
  palette: string[];
  fontPack: FontPackKey;
  typography: {
    heading: string;
    body: string;
    accent?: string;
  };
  backgroundPolicy: string;
  imageStyle: string;
  slideDensity: 'low' | 'medium' | 'high';
  socialCardStyle: string;
  prophecyRules: string[];
  decorativeStyle: string;
}

@Injectable()
export class VisualStyleService {
  resolveStyle(
    sermon: Sermon,
    understanding: SermonUnderstanding,
    requestedVisualStyle: VisualStyleKey = 'auto',
  ): VisualStyleProfile {
    const key = requestedVisualStyle === 'auto' ? understanding.recommendedVisualStyle : requestedVisualStyle;
    return this.profileForKey(key, sermon, understanding);
  }

  profileForKey(key: VisualStyleKey, sermon: Sermon, understanding: SermonUnderstanding): VisualStyleProfile {
    const language = String((sermon as any).language || sermon.planning?.language || '').toLowerCase();
    const isSpanish = language.startsWith('es');
    const base: Record<string, VisualStyleProfile> = {
      warm_pastoral_light: {
        key: 'warm_pastoral_light' as VisualStyleKey,
        label: 'Warm Pastoral Light',
        palette: ['#FFF7ED', '#FDE68A', '#D97706', '#1C1917'],
        fontPack: 'warm_pastoral' as FontPackKey,
        typography: { heading: 'Playfair Display', body: 'Inter', accent: '#F59E0B' },
        backgroundPolicy: 'Warm cream, gold, soft brown, deep charcoal. Subtle texture. Soft light gradients. Gentle photography/illustration backgrounds.',
        imageStyle: 'Warm, pastoral, illuminated path, steady hand, homecoming, sunrise over road, gentle cross-shaped light.',
        slideDensity: 'low' as const,
        socialCardStyle: 'Warm, story-led, inviting.',
        prophecyRules: ['Keep mood restorative and hopeful.'],
        decorativeStyle: 'soft_gradients',
      },
      modern_church_dark: {
        key: 'modern_church_dark' as VisualStyleKey,
        label: 'Modern Church Dark',
        palette: ['#0F172A', '#1E40AF', '#38BDF8', '#F8FAFC'],
        fontPack: 'modern_church' as FontPackKey,
        typography: { heading: 'Montserrat', body: 'Inter', accent: '#38BDF8' },
        backgroundPolicy: 'Deep navy, cyan accent, white text. Clean geometry. Strong contrast. Modern sans headings.',
        imageStyle: 'Modern, clean, geometric, high contrast, architectural church visuals.',
        slideDensity: 'medium' as const,
        socialCardStyle: 'Bold, modern, clean with strong hierarchy.',
        prophecyRules: ['Keep design clean; avoid clutter.'],
        decorativeStyle: 'clean_geometry',
      },
      reverent_worship: {
        key: 'reverent_worship' as VisualStyleKey,
        label: 'Reverent Worship',
        palette: ['#0F172A', '#1E293B', '#F8FAFC', '#F59E0B'],
        fontPack: 'scripture_elegant' as FontPackKey,
        typography: { heading: 'Cormorant Garamond', body: 'Lato', accent: '#93C5FD' },
        backgroundPolicy: 'Use elegant worship imagery with generous negative space.',
        imageStyle: 'Cinematic reverent worship, soft contrast, polished church atmosphere.',
        slideDensity: 'medium' as const,
        socialCardStyle: 'Balanced, clean, and worshipful.',
        prophecyRules: ['Avoid sensationalism; keep the tone worshipful and steady.'],
        decorativeStyle: 'elegant_minimal',
      },
      warm_pastoral: {
        key: 'warm_pastoral' as VisualStyleKey,
        label: 'Warm Pastoral',
        palette: ['#FFF7ED', '#FDE68A', '#D97706', '#1C1917'],
        fontPack: 'warm_pastoral' as FontPackKey,
        typography: { heading: 'Playfair Display', body: 'Inter', accent: '#F97316' },
        backgroundPolicy: 'Use warm light, homecoming imagery, and pastoral calm.',
        imageStyle: 'Warm, human, hopeful, with soft light and generous space.',
        slideDensity: 'medium' as const,
        socialCardStyle: 'Warm, inviting, and story-led.',
        prophecyRules: ['Keep the mood hopeful and restorative.'],
        decorativeStyle: 'soft_gradients',
      },
      scripture_elegant: {
        key: 'scripture_elegant' as VisualStyleKey,
        label: 'Elegant Scripture',
        palette: ['#1C1917', '#44403C', '#FEF3C7', '#F8FAFC'],
        fontPack: 'scripture_elegant' as FontPackKey,
        typography: { heading: 'Cormorant Garamond', body: 'Lato', accent: '#D97706' },
        backgroundPolicy: 'Parchment/warm paper or deep navy. Large scripture text. Minimal decoration. Reference emphasized.',
        imageStyle: 'Open Bible, parchment texture, warm candlelight, manuscript aesthetic.',
        slideDensity: 'low' as const,
        socialCardStyle: 'Elegant, scripture-forward, minimal.',
        prophecyRules: ['Let Scripture text dominate the visual space.'],
        decorativeStyle: 'parchment_texture',
      },
      evangelistic_invitation: {
        key: 'evangelistic_invitation' as VisualStyleKey,
        label: 'Evangelistic Invitation',
        palette: ['#0F172A', '#1D4ED8', '#FEF3C7', '#FDE68A'],
        fontPack: 'warm_pastoral' as FontPackKey,
        typography: { heading: 'Playfair Display', body: 'Inter', accent: '#FACC15' },
        backgroundPolicy: 'Sunrise, open path, warm gold, soft white. High hope, high clarity. No gloomy admin card look.',
        imageStyle: 'Bright, invitational, hope-forward, decision-centered. Sunrise, open door, cross-light.',
        slideDensity: 'low' as const,
        socialCardStyle: 'Strong call-to-action with a clear emotional hook.',
        prophecyRules: ['Invite response without pressure or manipulation.'],
        decorativeStyle: 'warm_light',
      },
      hopeful_prophecy: {
        key: 'hopeful_prophecy' as VisualStyleKey,
        label: 'Hopeful Prophecy',
        palette: ['#0F172A', '#0EA5E9', '#F8FAFC', '#FCD34D'],
        fontPack: 'hopeful_prophecy' as FontPackKey,
        typography: { heading: 'Merriweather', body: 'Source Sans 3', accent: '#38BDF8' },
        backgroundPolicy: 'Midnight blue, gold, white. Symbolic light, globe, open Bible, worship motifs. No fear-bait imagery. No chaotic fire/beasts as default.',
        imageStyle: 'Hopeful, luminous, non-sensational prophetic imagery. Gospel proclamation, Creator worship, heavenly light.',
        slideDensity: 'medium' as const,
        socialCardStyle: 'Clear prophetic hope with strong readability.',
        prophecyRules: ['No beasts, flames, or doom imagery by default.', 'Keep Jesus and the gospel central.'],
        decorativeStyle: 'celestial_light',
      },
      bible_study_clean: {
        key: 'bible_study_clean' as VisualStyleKey,
        label: 'Bible Study Clean',
        palette: ['#1F2937', '#2563EB', '#F9FAFB', '#E5E7EB'],
        fontPack: 'scripture_elegant' as FontPackKey,
        typography: { heading: 'Source Sans Pro', body: 'Inter', accent: '#60A5FA' },
        backgroundPolicy: 'Use clean study visuals, open Bible, and white space.',
        imageStyle: 'Readable, structured, low-clutter, study-focused.',
        slideDensity: 'high' as const,
        socialCardStyle: 'Simple, informative, and easy to scan.',
        prophecyRules: ['Keep slides text-forward and calm.'],
        decorativeStyle: 'clean_minimal',
      },
      youth_modern: {
        key: 'youth_modern' as VisualStyleKey,
        label: 'Youth Modern',
        palette: ['#111827', '#8B5CF6', '#22D3EE', '#F8FAFC'],
        fontPack: 'youth_contemporary' as FontPackKey,
        typography: { heading: 'Poppins', body: 'Inter', accent: '#A78BFA' },
        backgroundPolicy: 'Use energetic motion, bold shapes, and modern contrast.',
        imageStyle: 'Modern, energetic, polished, youth-forward.',
        slideDensity: 'medium' as const,
        socialCardStyle: 'Bolder visuals with punchy hierarchy.',
        prophecyRules: ['Keep tone modern but still reverent.'],
        decorativeStyle: 'bold_geometric',
      },
      spanish_church_warm: {
        key: 'spanish_church_warm' as VisualStyleKey,
        label: 'Spanish Church Warm',
        palette: ['#7C2D12', '#EA580C', '#FFF7ED', '#1F2937'],
        fontPack: 'warm_pastoral' as FontPackKey,
        typography: { heading: 'Playfair Display', body: 'Inter', accent: '#FB923C' },
        backgroundPolicy: 'Use warm fellowship, family, and community imagery.',
        imageStyle: 'Warm, welcoming, bilingual-friendly church visuals.',
        slideDensity: 'medium' as const,
        socialCardStyle: 'Family-centered and welcoming.',
        prophecyRules: ['Keep Spanish copy concise and easy to read.'],
        decorativeStyle: 'soft_gradients',
      },
    };

    const profile = base[key] || base.reverent_worship;
    return profile;
  }
}
