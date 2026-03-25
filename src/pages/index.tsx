import dynamic from 'next/dynamic'

// The widget uses Web Crypto (jose) and browser-only APIs — disable SSR to
// prevent hydration mismatches.
const OfframpWidget = dynamic(
  () => import('@/components/OfframpWidget').then((m) => m.OfframpWidget),
  { ssr: false },
)

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gray-100">
      <OfframpWidget
        onSuccess={(transferId) => {
          console.log('Transfer complete:', transferId)
        }}
        onError={(err) => {
          console.error('Widget error:', err)
        }}
      />
    </div>
  )
}
