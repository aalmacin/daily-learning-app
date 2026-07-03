export const IMAGE_MODELS = [
  { id: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
  { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
  { id: 'gpt-image-2', label: 'GPT Image 2' },
] as const;

export const DEFAULT_IMAGE_MODEL: string = IMAGE_MODELS[0].id;

export function isValidImageModel(model: string): boolean {
  return IMAGE_MODELS.some((m) => m.id === model);
}
