export interface RuntimeDependencies {
  openRouterApiKey: string;
}

export const resolveRuntimeDependencies = (
  env: NodeJS.ProcessEnv = process.env,
) : RuntimeDependencies => {
  const openRouterApiKey = env.OPENROUTER_API_KEY?.trim();

  if (!openRouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required — set it in .env or your environment",
    );
  }

  return { openRouterApiKey };
};
