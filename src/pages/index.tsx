import { OfframpWidget } from '@/components/OfframpWidget'

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
