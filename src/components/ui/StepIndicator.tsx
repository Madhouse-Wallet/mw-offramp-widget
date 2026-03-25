import React from 'react'
import type { Step } from '../../types'

const STEPS: { id: Step; label: string }[] = [
  { id: 'amount', label: 'Amount' },
  { id: 'recipient', label: 'Recipient' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'send', label: 'Send' },
]

const STEP_ORDER: Step[] = ['amount', 'recipient', 'confirm', 'send']

interface StepIndicatorProps {
  current: Step
}

export function StepIndicator({ current }: StepIndicatorProps) {
  const currentIndex = STEP_ORDER.indexOf(current)

  return (
    <div className="flex items-center justify-between px-1">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex
        const isCurrent = index === currentIndex
        const isUpcoming = index > currentIndex

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  isCompleted
                    ? 'bg-orange-600 text-white'
                    : isCurrent
                      ? 'border-2 border-orange-500 bg-white text-orange-600'
                      : 'border-2 border-gray-300 bg-white text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={`text-xs font-medium ${
                  isCurrent ? 'text-orange-600' : isCompleted ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>

            {index < STEPS.length - 1 && (
              <div
                className={`mb-5 h-0.5 flex-1 mx-2 transition-all ${
                  isCompleted ? 'bg-orange-500' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export { STEP_ORDER }
export type { Step }
