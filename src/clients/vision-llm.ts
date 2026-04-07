import { callOpenRouter } from './openrouter.js';

export const callVisionLLM = async <T>(
  base64Image: string,
  apiKey: string,
  systemPrompt: string,
  userText: string,
  schemaName: string,
  schema: Record<string, unknown>,
): Promise<T> => {
  const { data } = await callOpenRouter<T>({
    apiKey,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}` },
          },
          { type: 'text', text: userText },
        ],
      },
    ],
    schemaName,
    schema,
  });

  return data;
};
