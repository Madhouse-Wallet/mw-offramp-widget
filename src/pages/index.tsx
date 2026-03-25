import React, { useState } from 'react'
import dynamic from 'next/dynamic'

// The widget uses Web Crypto (jose) and browser-only APIs — disable SSR to
// prevent hydration mismatches.
const OfframpWidget = dynamic(
  () => import('@/components/OfframpWidget').then((m) => m.OfframpWidget),
  { ssr: false },
)

function WhatsAppButton() {
  const [hovered, setHovered] = useState(false)
  const whatsappLink = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_URL ?? 'https://wa.me/14847739576'
  return (
    <>
      {/* Mobile: inline below widget */}
      <a
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with support on WhatsApp"
        className="sm:hidden mt-4 flex items-center justify-center gap-2 w-full max-w-md rounded-xl bg-[#25D366] py-3 text-sm font-medium text-white shadow hover:bg-[#20bd5a] transition-colors focus:outline-none"
        style={{ textDecoration: 'none' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5 fill-white shrink-0" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Chat with Support
      </a>

      {/* Desktop: fixed FAB bottom-right */}
      <div className="hidden sm:flex fixed bottom-6 right-6 z-50 items-center gap-2">
        <span
          className={[
            'whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow pointer-events-none transition-all duration-200',
            hovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2',
          ].join(' ')}
        >
          Chat with Support
        </span>
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with support on WhatsApp"
          onMouseDown={(e) => e.currentTarget.blur()}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-colors duration-200 hover:bg-[#20bd5a] focus:outline-none"
          style={{ textDecoration: 'none' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-7 w-7 fill-white" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </a>
      </div>
    </>
  )
}

function RecaptchaBadge() {
  if (!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) return null
  const badge = (
    <div className="flex items-center gap-1 rounded bg-white/80 px-2 py-1 shadow-sm backdrop-blur-sm">
      <svg width="14" height="14" viewBox="0 0 64 64" aria-hidden="true">
        <path fill="#4A90D9" d="M32 0C14.3 0 0 14.3 0 32s14.3 32 32 32 32-14.3 32-32S49.7 0 32 0z"/>
        <path fill="#fff" d="M32 10c-12.1 0-22 9.9-22 22s9.9 22 22 22 22-9.9 22-22-9.9-22-22-22zm0 38c-8.8 0-16-7.2-16-16s7.2-16 16-16 16 7.2 16 16-7.2 16-16 16z"/>
        <path fill="#4A90D9" d="M32 22c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10-4.5-10-10-10z"/>
      </svg>
      <span className="text-[10px] leading-none text-gray-500">
        reCAPTCHA{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy</a>
        {' · '}
        <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a>
      </span>
    </div>
  )
  return (
    <>
      {/* Mobile: inline below widget */}
      <div className="sm:hidden mt-3 w-full max-w-md flex justify-center">
        {badge}
      </div>
      {/* Desktop: fixed bottom-left */}
      <div className="hidden sm:block fixed bottom-4 left-4 z-50">
        {badge}
      </div>
    </>
  )
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 pb-8 bg-gray-100">
      <OfframpWidget
        onSuccess={(transferId) => {
          console.log('Transfer complete:', transferId)
        }}
        onError={(err) => {
          console.error('Widget error:', err)
        }}
      />
      <WhatsAppButton />
      <RecaptchaBadge />
    </div>
  )
}
