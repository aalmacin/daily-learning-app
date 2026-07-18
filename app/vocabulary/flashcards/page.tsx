import { redirect } from 'next/navigation';

export default function VocabularyFlashcardsRedirect() {
  redirect('/flashcards?tab=vocabulary');
}
