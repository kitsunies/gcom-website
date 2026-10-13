export const apiVersion = '2026-10-01';

export function studioEnvironment(env: Record<string, string | undefined>) {
  const projectId = env.SANITY_STUDIO_PROJECT_ID?.trim();
  const dataset = env.SANITY_STUDIO_DATASET?.trim();
  if (!projectId || !/^[a-z0-9]+$/.test(projectId))
    throw new Error(
      'Set SANITY_STUDIO_PROJECT_ID to your Sanity project ID before starting or building the Studio.',
    );
  if (!dataset || !/^[a-z0-9][a-z0-9_-]*$/.test(dataset))
    throw new Error(
      'Set SANITY_STUDIO_DATASET explicitly to your Sanity dataset before starting or building the Studio.',
    );
  return { projectId, dataset };
}
