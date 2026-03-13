import { SlideType } from '../../entities/slide-types';

export const defaultTemplatePack = {
  name: 'Core Sermon Pack',
  description: 'Common PowerPoint-style layouts for sermon decks',
};

export const defaultSlideTemplates = [
  {
    name: 'Title Slide',
    layoutKey: 'title_centered_v1',
    slideType: SlideType.TITLE,
    sortOrder: 1,
    supportsImage: true,
    fields: {
      title: 'string',
      subtitle: 'string',
    },
  },
  {
    name: 'Title and Content',
    layoutKey: 'title_content_v1',
    slideType: SlideType.POINT,
    sortOrder: 2,
    supportsImage: true,
    fields: {
      title: 'string',
      bullets: 'string[]',
    },
  },
  {
    name: 'Section Header',
    layoutKey: 'section_header_v1',
    slideType: SlideType.TRANSITION,
    sortOrder: 3,
    supportsImage: true,
    fields: {
      title: 'string',
      subtitle: 'string',
    },
  },
  {
    name: 'Transition Title',
    layoutKey: 'transition_title_v1',
    slideType: SlideType.TRANSITION,
    sortOrder: 4,
    supportsImage: true,
    fields: {
      title: 'string',
    },
  },
  {
    name: 'Two Content',
    layoutKey: 'two_content_v1',
    slideType: SlideType.SUPPORT,
    sortOrder: 5,
    supportsImage: true,
    fields: {
      title: 'string',
      left: 'string[]',
      right: 'string[]',
    },
  },
  {
    name: 'Comparison',
    layoutKey: 'comparison_v1',
    slideType: SlideType.SUPPORT,
    sortOrder: 6,
    supportsImage: false,
    fields: {
      title: 'string',
      leftTitle: 'string',
      rightTitle: 'string',
      left: 'string[]',
      right: 'string[]',
    },
  },
  {
    name: 'Title Only',
    layoutKey: 'title_only_v1',
    slideType: SlideType.POINT,
    sortOrder: 7,
    supportsImage: true,
    fields: {
      title: 'string',
    },
  },
  {
    name: 'Blank',
    layoutKey: 'blank_v1',
    slideType: SlideType.TRANSITION,
    sortOrder: 8,
    supportsImage: true,
    fields: {},
  },
  {
    name: 'Content with Caption',
    layoutKey: 'content_caption_v1',
    slideType: SlideType.APPLICATION,
    sortOrder: 9,
    supportsImage: true,
    fields: {
      title: 'string',
      caption: 'string',
      bullets: 'string[]',
    },
  },
  {
    name: 'Picture with Caption',
    layoutKey: 'picture_caption_v1',
    slideType: SlideType.ANNOUNCEMENT,
    sortOrder: 10,
    supportsImage: true,
    fields: {
      title: 'string',
      caption: 'string',
    },
  },
  {
    name: 'Scripture',
    layoutKey: 'scripture_centered_v1',
    slideType: SlideType.SCRIPTURE,
    sortOrder: 11,
    supportsImage: true,
    fields: {
      reference: 'string',
      lines: 'string[]',
    },
  },
  {
    name: 'Application',
    layoutKey: 'application_bullets_v1',
    slideType: SlideType.APPLICATION,
    sortOrder: 12,
    supportsImage: true,
    fields: {
      title: 'string',
      bullets: 'string[]',
    },
  },
  {
    name: 'Invitation',
    layoutKey: 'invitation_centered_v1',
    slideType: SlideType.INVITATION,
    sortOrder: 13,
    supportsImage: true,
    fields: {
      title: 'string',
      message: 'string',
    },
  },
];
