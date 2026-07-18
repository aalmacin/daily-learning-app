import { Store } from '@tanstack/store'
import type { VocabularyWord } from '@/lib/db'
import { addVocabularyWord } from '@/actions/vocabulary'

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

export function retryVocabResult(key: string) {
  vocabStore.setState((state) => ({
    ...state,
    activeWords: state.activeWords.map((w) =>
      w.status === 'error' && w.key === key
        ? ({ status: 'processing', key, word: w.word, type: w.type } as PendingVocabResult)
        : w
    ),
  }))
}

export function processVocabularyWord(
  key: string,
  word: string,
  type: 'word' | 'idiom',
  onResolved?: () => void,
) {
  addVocabularyWord(word, type)
    .then((w) => {
      resolveVocabResult(key, w)
      onResolved?.()
    })
    .catch((e) => rejectVocabResult(key, e instanceof Error ? e.message : 'Something went wrong', type))
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

export function updateWordInStore(word: VocabularyWord) {
  vocabStore.setState((state) => ({
    ...state,
    activeWords: state.activeWords.map((w) =>
      w.status === 'done' && w.id === word.id
        ? ({ ...w, ...word } as DoneVocabResult)
        : w,
    ),
  }))
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
