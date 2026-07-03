import { Store } from '@tanstack/store'
import type { VocabularyWord } from '@/lib/db'

export type PendingVocabResult = { status: 'processing'; key: string; word: string; type: 'word' | 'idiom' }
export type ErrorVocabResult = { status: 'error'; key: string; word: string; error: string }
export type DoneVocabResult = VocabularyWord & { status: 'done'; key: string }
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

export function resolveVocabResult(key: string, word: VocabularyWord) {
  vocabStore.setState((state) => ({
    ...state,
    activeWords: state.activeWords.map((w) =>
      w.key === key ? ({ ...word, status: 'done', key } as DoneVocabResult) : w
    ),
  }))
}

export function rejectVocabResult(key: string, error: string) {
  vocabStore.setState((state) => ({
    ...state,
    activeWords: state.activeWords.map((w) =>
      w.key === key ? ({ status: 'error', key, word: w.word, error } as ErrorVocabResult) : w
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

export function clearActiveWords() {
  vocabStore.setState(() => ({ activeWords: [], isResultVisible: false }))
}
