import { defineArrayMember, defineField, defineType } from 'sanity';

import { singletonTypes } from './singletons';
export { singletonTypes } from './singletons';
const title = (name: string) =>
  (name[0].toUpperCase() + name.slice(1)).replace(/([a-z])([A-Z])/g, '$1 $2');
const text = (name: string) =>
  defineField({
    name,
    title: title(name),
    type: 'string',
    validation: (rule) =>
      rule
        .required()
        .max(5000)
        .custom((value) =>
          typeof value === 'string' &&
          value.trim() &&
          !/[\u0000-\u001f\u007f-\u009f]/.test(value)
            ? true
            : 'Enter non-empty text without control characters.',
        ),
  });
const texts = (...names: string[]) => names.map(text);
const object = (name: string, fields: ReturnType<typeof defineField>[]) =>
  defineType({
    name,
    title: title(name),
    type: 'object',
    fields,
  });
const field = (name: string, type: string) =>
  defineField({
    name,
    title: title(name),
    type,
    validation: (rule) => rule.required(),
  });
const array = (name: string, type: string, min = 0, max?: number) =>
  defineField({
    name,
    title: title(name),
    type: 'array',
    of: [
      type === 'string'
        ? defineArrayMember({
            type: 'string',
            validation: (rule) =>
              rule
                .required()
                .max(5000)
                .custom((value) =>
                  typeof value === 'string' && value.trim()
                    ? true
                    : 'Enter non-empty text.',
                ),
          })
        : defineArrayMember({ type }),
    ],
    validation: (rule) =>
      max === undefined
        ? rule.required().min(min)
        : rule.required().min(min).max(max),
  });

export function validHttps(value: unknown) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(value))
    return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function validInternal(value: unknown) {
  return (
    typeof value === 'string' &&
    /^(?:about\/|team\/|contact\/)?(?:#events|#quests)?$/.test(value)
  );
}
const linkUrl = defineField({
  name: 'url',
  title: 'Destination',
  type: 'string',
  initialValue: '',
  description:
    'Use a site route (about/, team/, contact/, #events, #quests) or a public HTTPS URL.',
  validation: (rule) =>
    rule.custom((value) =>
      value === undefined || validInternal(value) || validHttps(value)
        ? true
        : 'Use a known site route or HTTPS URL without credentials.',
    ),
});
const https = (name: string, allowEmpty = false) =>
  defineField({
    name,
    title: title(name),
    type: 'string',
    ...(allowEmpty ? { initialValue: '' } : {}),
    validation: (rule) =>
      rule.custom((value) =>
        (allowEmpty && (value === undefined || value === '')) ||
        validHttps(value)
          ? true
          : `Enter an HTTPS URL without credentials${allowEmpty ? ', or leave empty' : ''}.`,
      ),
  });
const image = (name: string, descriptive = false) =>
  defineType({
    name,
    title: name === 'portraitImage' ? 'Portrait' : 'Image',
    type: 'image',
    options: { hotspot: false },
    fields: [
      defineField({
        name: 'alt',
        title: 'Alternative text',
        type: 'string',
        initialValue: '',
        description:
          'Describe meaningful images. Leave empty for decorative artwork.',
        validation: (rule) =>
          rule
            .max(5000)
            .custom((value) =>
              (!descriptive && value === undefined) ||
              (typeof value === 'string' &&
                !/[\u0000-\u001f\u007f-\u009f]/.test(value) &&
                (!descriptive || value.trim()))
                ? true
                : descriptive
                  ? 'Describe the social sharing image.'
                  : 'Set alternative text, or an empty string for decorative artwork.',
            ),
      }),
    ],
    validation: (rule) =>
      rule.custom((value) => {
        if (!value) return true;
        const media = value as {
          asset?: { _ref?: string };
          crop?: unknown;
          hotspot?: unknown;
        };
        if (!media.asset?._ref) return 'Choose an uploaded image.';
        if (media.crop || media.hotspot)
          return 'Keep the original artwork framing: remove crop and hotspot.';
        return true;
      }),
  });
const doc = (
  name: (typeof singletonTypes)[number],
  fields: ReturnType<typeof defineField>[],
) =>
  defineType({
    name,
    title: title(name),
    type: 'document',
    fields,
    preview: { prepare: () => ({ title: title(name) }) },
  });

export const schemaTypes = [
  image('siteImage'),
  image('socialImage', true),
  image('portraitImage'),
  object('action', [text('label'), linkUrl]),
  object('publicLink', [text('label'), https('url')]),
  object('metadata', [
    ...texts('title', 'description'),
    field('image', 'socialImage'),
  ]),
  object('intro', texts('eyebrow', 'title', 'lead')),
  object('brand', texts('before', 'highlight', 'after')),
  object(
    'artwork',
    ['hero', 'purple', 'green', 'yellow', 'coral', 'cross'].map((name) =>
      field(name, 'siteImage'),
    ),
  ),
  object('navigationLink', [
    defineField({
      name: 'key',
      type: 'string',
      options: { list: ['home', 'events', 'about', 'team', 'contact'] },
      validation: (rule) =>
        rule
          .required()
          .custom((value) =>
            typeof value === 'string' &&
            ['home', 'events', 'about', 'team', 'contact'].includes(value)
              ? true
              : 'Choose a known page or events.',
          ),
    }),
    text('label'),
    linkUrl,
  ]),
  object('footer', texts('tagline', 'description', 'joinLabel')),
  object(
    'invitation',
    texts('eyebrow', 'heading', 'highlight', 'text', 'action'),
  ),
  object('motion', texts('create', 'play', 'pauseLabel', 'playLabel')),
  object('hero', [
    ...texts('university', 'club'),
    array('heading', 'string', 2, 2),
    ...texts('description', 'joinLabel'),
    field('explore', 'action'),
  ]),
  object('quest', [
    text('name'),
    defineField({
      name: 'theme',
      type: 'string',
      options: { list: ['purple', 'green', 'yellow'] },
      validation: (rule) =>
        rule
          .required()
          .custom((value) =>
            typeof value === 'string' &&
            ['purple', 'green', 'yellow'].includes(value)
              ? true
              : 'Choose purple, green or yellow.',
          ),
    }),
    ...texts('label', 'text'),
    field('action', 'action'),
  ]),
  object(
    'events',
    texts(
      'eyebrow',
      'heading',
      'calendarLabel',
      'eventLabel',
      'emptyHeading',
      'emptyText',
      'unconnectedHeading',
      'unconnectedText',
      'note',
    ),
  ),
  object('paragraph', texts('heading', 'text')),
  object('activity', texts('name', 'text')),
  object('member', [
    ...['id', 'name', 'role'].map((name) =>
      defineField({
        name,
        type: 'string',
        validation: (rule) =>
          rule
            .required()
            .max(name === 'id' ? 200 : 120)
            .custom((value) =>
              typeof value === 'string' &&
              value.trim() &&
              !/[\u0000-\u001f\u007f-\u009f]/.test(value)
                ? true
                : 'Enter non-empty text without control characters.',
            ),
      }),
    ),
    defineField({
      name: 'photo',
      title: 'Portrait (optional)',
      type: 'portraitImage',
    }),
    array('links', 'publicLink', 0, 6),
  ]),
  object(
    'sidebar',
    texts('heading', 'text', 'joinHeading', 'joinText', 'joinLabel'),
  ),
  object(
    'contactForm',
    texts(
      'heading',
      'introduction',
      'label',
      'legend',
      'nameLabel',
      'emailLabel',
      'emailHelp',
      'subjectLabel',
      'optionalLabel',
      'messageLabel',
      'messagePlaceholder',
      'honeypotLabel',
      'sendLabel',
      'sendingLabel',
      'directPrompt',
      'directLabel',
      'defaultSubject',
      'sending',
      'unavailable',
      'rateLimited',
      'invalid',
      'tooLarge',
      'failed',
      'success',
      'unreachable',
    ),
  ),
  doc('settings', [
    text('name'),
    field('brand', 'brand'),
    text('fullName'),
    field('logo', 'siteImage'),
    https('membershipUrl'),
    defineField({
      name: 'contactEmail',
      type: 'string',
      validation: (rule) => rule.required().max(254).email(),
    }),
    https('calendarUrl', true),
    field('artwork', 'artwork'),
  ]),
  doc('navigation', [
    ...texts('brandLabel', 'menuOpen', 'menuClose', 'label', 'skipLabel'),
    defineField({
      ...array('links', 'navigationLink', 1),
      validation: (rule) =>
        rule
          .required()
          .min(1)
          .custom((value) => {
            const links = value as { key?: string }[] | undefined;
            return !links ||
              new Set(links.map((link) => link.key)).size === links.length
              ? true
              : 'Navigation keys must be unique.';
          }),
    }),
    text('joinLabel'),
    field('footer', 'footer'),
    field('invitation', 'invitation'),
    field('motion', 'motion'),
  ]),
  doc('home', [
    field('metadata', 'metadata'),
    field('hero', 'hero'),
    array('divider', 'string', 1),
    ...texts('questsEyebrow', 'questsHeading'),
    array('quests', 'quest', 3, 3),
    field('events', 'events'),
  ]),
  doc('about', [
    field('metadata', 'metadata'),
    field('intro', 'intro'),
    array('sections', 'paragraph', 1),
    field('action', 'action'),
    ...texts('activitiesLabel', 'activitiesHeading'),
    field('image', 'siteImage'),
    array('activities', 'activity', 1),
  ]),
  doc('team', [
    field('metadata', 'metadata'),
    field('intro', 'intro'),
    ...texts('label', 'linksLabel'),
    defineField({
      ...array('members', 'member', 0, 100),
      validation: (rule) =>
        rule
          .required()
          .max(100)
          .custom((value) => {
            const members = value as { id?: string }[] | undefined;
            return !members ||
              new Set(members.map((member) => member.id)).size ===
                members.length
              ? true
              : 'Committee member IDs must be unique.';
          }),
    }),
    ...texts('emptyHeading', 'emptyText'),
    field('image', 'siteImage'),
  ]),
  doc('contact', [
    field('metadata', 'metadata'),
    field('intro', 'intro'),
    field('image', 'siteImage'),
    field('sidebar', 'sidebar'),
    field('form', 'contactForm'),
  ]),
];
