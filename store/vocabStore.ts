import { Store } from '@tanstack/store'
import type { VocabularyWord } from '@/lib/db'

export type PendingVocabResult = { status: 'processing'; key: string; word: string; type: 'word' | 'idiom' }
export type ErrorVocabResult = { status: 'error'; key: string; word: string; error: string; type: 'word' | 'idiom' }
export type DoneVocabResult = VocabularyWord & { status: 'done'; key: string; fromDb?: boolean }
export type VocabResult = PendingVocabResult | ErrorVocabResult | DoneVocabResult

interface VocabState {
  activeWords: VocabResult[]
  isResultVisible: boolean
}

export const vocabStore = new Store<VocabState>({
  activeWords: [],
  isResultVisible: false,
})

export function addPendingWords(entries: { key: string; word: string; type: 'word' | 'idiom' }[]) {
  const pending: PendingVocabResult[] = entries.map((e) => ({ status: 'processing', key: e.key, word: e.word, type: e.type }))
  vocabStore.setState((state) => ({
    activeWords: [...state.activeWords, ...pending],
    isResultVisible: true,
  }))
}

export function resolveVocabResult(key: string, word: VocabularyWord & { fromDb?: boolean }) {
  vocabStore.setState((state) => ({
    ...state,
    activeWords: state.activeWords.map((w) =>
      w.key === key ? ({ ...word, status: 'done', key } as DoneVocabResult) : w
    ),
  }))
}

export function rejectVocabResult(key: string, error: string, type: 'word' | 'idiom') {
  vocabStore.setState((state) => ({
    ...state,
    activeWords: state.activeWords.map((w) =>
      w.key === key ? ({ status: 'error', key, word: w.word, error, type } as ErrorVocabResult) : w
    ),
  }))
}

export function dismissWord(key: string) {
  vocabStore.setState((state) => {
    const activeWords = state.activeWords.filter((w) => w.key !== key)
    return { activeWords, isResultVisible: activeWords.length > 0 }
  })
}

export function removeWordFromStore(id: number) {
  vocabStore.setState((state) => {
    const activeWords = state.activeWords.filter((w) => w.status !== 'done' || w.id !== id)
    return { activeWords, isResultVisible: activeWords.length > 0 }
  })
}

export function updateWordImageInStore(id: number, imageUrl: string, imageModel: string) {
  vocabStore.setState((state) => ({
    ...state,
    activeWords: state.activeWords.map((w) =>
      w.status === 'done' && w.id === id
        ? ({ ...w, image_url: imageUrl, image_model: imageModel } as DoneVocabResult)
        : w,
    ),
  }))
}

export function clearActiveWords() {
  vocabStore.setState(() => ({ activeWords: [], isResultVisible: false }))
}
