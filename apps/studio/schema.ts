import { defineArrayMember, defineField, defineType } from 'sanity';

export { singletonTypes } from './singletons';

const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;
const fieldText = (name: string, max: number) =>
  defineField({
    name,
    type: 'string',
    validation: (rule) =>
      rule
        .required()
        .max(max)
        .custom((value) =>
          typeof value === 'string' &&
          value.trim() &&
          !controlCharacters.test(value)
            ? true
            : `Enter non-empty text up to ${max} characters without control characters.`,
        ),
  });

export function validHttps(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\u0000-\u0020\u007f-\u009f]/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

const portraitImage = defineType({
  name: 'portraitImage',
  title: 'Portrait',
  type: 'image',
  options: { hotspot: false },
  fields: [
    defineField({
      name: 'alt',
      title: 'Alternative text',
      type: 'string',
      initialValue: '',
      validation: (rule) =>
        rule
          .max(5000)
          .custom((value) =>
            value === undefined ||
            (typeof value === 'string' && !controlCharacters.test(value))
              ? true
              : 'Enter alternative text without control characters.',
          ),
    }),
  ],
  validation: (rule) =>
    rule.custom((value) => {
      if (!value) return true;
      const image = value as {
        asset?: { _ref?: string };
        crop?: unknown;
        hotspot?: unknown;
      };
      if (!image.asset?._ref) return 'Choose an uploaded portrait.';
      if (image.crop || image.hotspot)
        return 'Keep the original portrait framing: remove crop and hotspot.';
      return true;
    }),
});

const publicLink = defineType({
  name: 'publicLink',
  title: 'Public link',
  type: 'object',
  fields: [
    fieldText('label', 60),
    defineField({
      name: 'url',
      type: 'string',
      validation: (rule) =>
        rule
          .required()
          .max(2048)
          .custom((value) =>
            validHttps(value) ? true : 'Enter a safe public HTTPS URL.',
          ),
    }),
  ],
});

const member = defineType({
  name: 'member',
  title: 'Member',
  type: 'object',
  fields: [
    fieldText('id', 200),
    fieldText('name', 120),
    fieldText('role', 120),
    defineField({
      name: 'photo',
      title: 'Portrait (optional)',
      type: 'portraitImage',
    }),
    defineField({
      name: 'links',
      type: 'array',
      of: [defineArrayMember({ type: 'publicLink' })],
      validation: (rule) => rule.required().max(6),
    }),
  ],
});

const roster = defineType({
  name: 'roster',
  title: 'Roster',
  type: 'document',
  fields: [
    defineField({
      name: 'members',
      title: 'Members',
      type: 'array',
      of: [defineArrayMember({ type: 'member' })],
      validation: (rule) =>
        rule
          .required()
          .max(100)
          .custom((value) => {
            const members = value as { id?: string }[] | undefined;
            return !members ||
              new Set(members.map((item) => item.id)).size === members.length
              ? true
              : 'Member IDs must be unique.';
          }),
    }),
  ],
  preview: { prepare: () => ({ title: 'Roster' }) },
});

export const schemaTypes = [portraitImage, publicLink, member, roster];
