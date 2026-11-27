import { lazy, Suspense } from 'react'
import Disclosure from './Disclosure.jsx'

const RecentFormBody = lazy(() => import('./RecentFormBody.jsx'))

export default function RecentForm({ raceId, raceDate, entries = [], boxUmaban = [], initiallyOpen = false }) {
  return (
    <Disclosure label="近走（公式・直近5走）" className="kinso-disclosure" initialOpen={initiallyOpen}>
      <Suspense fallback={<p className="kinso-note">読み込み中…</p>}>
        <RecentFormBody raceId={raceId} raceDate={raceDate} entries={entries} boxUmaban={boxUmaban} />
      </Suspense>
    </Disclosure>
  )
}
