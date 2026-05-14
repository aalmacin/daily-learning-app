export const queryKeys = {
  terms: {
    all: () => ['terms'] as const,
    detail: (id: number) => ['terms', id] as const,
  },
  categories: {
    all: () => ['categories'] as const,
  },
  termList: {
    all: () => ['termList'] as const,
  },
}
