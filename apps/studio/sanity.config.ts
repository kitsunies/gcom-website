import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { studioEnvironment } from './environment';
import { schemaTypes, singletonTypes } from './schema';

const singletons = new Set<string>(singletonTypes);
export default defineConfig({
  name: 'gcom',
  title: 'GCOM Content',
  ...studioEnvironment({
    SANITY_STUDIO_PROJECT_ID: process.env.SANITY_STUDIO_PROJECT_ID,
    SANITY_STUDIO_DATASET: process.env.SANITY_STUDIO_DATASET,
  }),
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('GCOM content')
          .items(
            singletonTypes.map((type) =>
              S.listItem()
                .id(type)
                .title(type[0].toUpperCase() + type.slice(1))
                .child(S.document().schemaType(type).documentId(type)),
            ),
          ),
    }),
  ],
  schema: {
    types: schemaTypes,
    templates: (templates) =>
      templates.filter((template) => !singletons.has(template.schemaType)),
  },
  document: {
    newDocumentOptions: (options) =>
      options.filter((option) => !singletons.has(option.templateId)),
    actions: (actions, context) =>
      singletons.has(context.schemaType)
        ? actions.filter(
            (action) =>
              action.action !== 'delete' && action.action !== 'duplicate',
          )
        : actions,
  },
});
