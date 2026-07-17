import { AddPanel } from '@/components/AddPanel'
import { getCurrentUser } from '@/lib/auth'
import { getVocabularyWords } from '@/lib/db'

export default async function Home() {
  const user = await getCurrentUser()
  const words = user ? await getVocabularyWords(user.id) : []

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 flex flex-col gap-8 w-full">
      <AddPanel initialVocabWords={words} />
    </main>
  )
}
