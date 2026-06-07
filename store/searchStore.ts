import { Store } from '@tanstack/store'

interface SearchState {
  isOpen: boolean
}

export const searchStore = new Store<SearchState>({ isOpen: false })

export function openSearch() {
  searchStore.setState(() => ({ isOpen: true }))
}

export function closeSearch() {
  searchStore.setState(() => ({ isOpen: false }))
}

export function toggleSearch() {
  searchStore.setState((state) => ({ isOpen: !state.isOpen }))
}
