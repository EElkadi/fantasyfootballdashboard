import { Metadata } from 'next'
import { MyBoard } from '@/components/league/MyBoard'

export const metadata: Metadata = { title: 'My Draft Board' }

export default function MyBoardPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">My Draft Board</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your rankings, your device. Players get crossed out as they come off the league board on draft night.
        </p>
      </div>
      <MyBoard />
    </div>
  )
}
