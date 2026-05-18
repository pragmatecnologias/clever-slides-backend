import { FieldStyle } from '../../entities/slide-template.entity';
import { SlideType } from '../../entities/slide-types';

export type SlideStyleDefaults = Partial<Record<'title' | 'subtitle' | 'body' | 'caption' | 'reference' | 'message' | 'bullets' | 'lines', FieldStyle>>;

export function cleanText(value?: unknown): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatPresentationSentence(value?: unknown, maxLength = 96): string {
  const raw = cleanText(value).replace(/^[•\-\u2022]\s*/, '').trim();
  if (!raw) return '';
  const shortened = shortenText(raw, maxLength).replace(/\s+/g, ' ').trim();
  if (!shortened) return '';
  const capitalized = shortened[0] ? `${shortened[0].toUpperCase()}${shortened.slice(1)}` : shortened;
  if (/[.!?…]$/.test(capitalized)) return capitalized;
  return `${capitalized}.`;
}

export function shortenText(value: unknown, maxLength: number): string {
  const text = cleanText(value);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.5 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

export function splitTextIntoLines(value: unknown, maxLines = 3, maxCharsPerLine = 42): string[] {
  const text = cleanText(value);
  if (!text) return [];

  const sentenceParts = text
    .split(/(?<=[.!?;:])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  const source = sentenceParts.length > 1 ? sentenceParts : text.split(/\s+/);
  let current = '';

  for (const part of source) {
    const candidate = current ? `${current} ${part}` : part;
    if (candidate.length > maxCharsPerLine && current) {
      chunks.push(current.trim());
      current = part;
    } else {
      current = candidate;
    }
    if (chunks.length >= maxLines) break;
  }

  if (current && chunks.length < maxLines) {
    chunks.push(current.trim());
  }

  return chunks
    .map((line) => shortenText(line, maxCharsPerLine + 8))
    .filter(Boolean)
    .slice(0, maxLines);
}

export function normalizeBulletList(values: unknown[], options?: { maxBullets?: number; maxChars?: number }): string[] {
  const maxBullets = options?.maxBullets ?? 4;
  const maxChars = options?.maxChars ?? 64;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const text = cleanText(raw)
      .replace(/^[•\-\u2022]\s*/, '')
      .replace(/^\d+\.\s*/, '')
      .trim();
    if (!text) continue;

    const compact = formatPresentationSentence(text, maxChars);
    const key = compact
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(compact);
    if (result.length >= maxBullets) break;
  }

  return result;
}

export function splitPassageText(text: unknown, maxLines = 3): string[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  const verseMarkers = cleaned.match(/\b\d{1,3}:\d{1,3}(?:-\d{1,3})?\b/g);
  if (verseMarkers && verseMarkers.length > 1) {
    const chunks = cleaned
      .split(/(?=\b\d{1,3}:\d{1,3}(?:-\d{1,3})?\b)/g)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    return chunks.slice(0, maxLines).map((chunk) => shortenText(chunk, 52));
  }

  const punctuationSplit = cleaned
    .split(/(?<=[.!?;:])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (punctuationSplit.length > 1) {
    return punctuationSplit.slice(0, maxLines).map((part) => shortenText(part, 52));
  }

  return splitTextIntoLines(cleaned, maxLines, 44);
}

export function estimateFontSize(text: unknown, baseSize: number, minSize: number, maxCharsPerLine: number, maxLines = 1): number {
  const cleaned = cleanText(text);
  if (!cleaned) return baseSize;
  const lineEstimate = Math.max(1, Math.ceil(cleaned.length / Math.max(1, maxCharsPerLine)));
  const effectiveLines = Math.min(maxLines, lineEstimate);
  const charPenalty = Math.max(0, cleaned.length - maxCharsPerLine) / Math.max(1, maxCharsPerLine);
  const linePenalty = Math.max(0, effectiveLines - 1) * 0.12;
  const computed = Math.round(baseSize * (1 - Math.min(0.45, charPenalty * 0.12 + linePenalty)));
  return Math.max(minSize, Math.min(baseSize, computed));
}

export function buildSlideStyleDefaults(
  type: SlideType,
  content: Record<string, any>,
): SlideStyleDefaults {
  const titleText = cleanText(content?.title || content?.reference || '');
  const subtitleText = cleanText(content?.subtitle || '');
  const bulletsText = Array.isArray(content?.bullets) ? content.bullets.join(' ') : cleanText(content?.bullets || '');
  const linesText = Array.isArray(content?.lines) ? content.lines.join(' ') : cleanText(content?.lines || '');
  const bodyText = cleanText(content?.body || content?.message || content?.caption || '');

  switch (type) {
    case SlideType.TITLE:
      return {
        title: {
          fontSize: estimateFontSize(titleText, 54, 36, 24, 2),
          align: 'center',
        },
        subtitle: {
          fontSize: estimateFontSize(subtitleText, 28, 18, 28, 2),
          align: 'center',
        },
      };
    case SlideType.SCRIPTURE:
      return {
        reference: {
          fontSize: estimateFontSize(titleText, 26, 18, 26, 1),
          align: 'center',
        },
        lines: {
          fontSize: estimateFontSize(linesText, 32, 22, 34, 3),
          align: 'center',
        },
      };
    case SlideType.POINT:
      return {
        title: {
          fontSize: estimateFontSize(titleText, 40, 28, 24, 2),
          align: 'left',
        },
        bullets: {
          fontSize: estimateFontSize(bulletsText, 28, 20, 32, 4),
          align: 'left',
        },
      };
    case SlideType.APPLICATION:
      return {
        title: {
          fontSize: estimateFontSize(titleText, 36, 28, 26, 2),
          align: 'center',
        },
        bullets: {
          fontSize: estimateFontSize(bulletsText, 26, 18, 34, 4),
          align: 'left',
        },
      };
    case SlideType.INVITATION:
      return {
        title: {
          fontSize: estimateFontSize(titleText, 46, 30, 20, 2),
          align: 'center',
        },
        message: {
          fontSize: estimateFontSize(bodyText, 26, 18, 24, 3),
          align: 'center',
        },
      };
    case SlideType.SUPPORT:
    case SlideType.TRANSITION:
    case SlideType.ANNOUNCEMENT:
    case SlideType.PRAYER:
    default:
      return {
        title: {
          fontSize: estimateFontSize(titleText, 36, 24, 26, 2),
          align: 'left',
        },
        body: {
          fontSize: estimateFontSize(bodyText, 24, 18, 34, 4),
          align: 'left',
        },
        caption: {
          fontSize: estimateFontSize(bodyText, 20, 16, 28, 3),
          align: 'left',
        },
      };
  }
}

export function buildSocialCopy(text: unknown, maxLines: number, maxCharsPerLine: number): string[] {
  return splitTextIntoLines(text, maxLines, maxCharsPerLine);
}
