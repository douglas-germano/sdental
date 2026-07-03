'use client'

import Link from 'next/link'
import { Sparkle as Sparkles, ArrowLeft } from '@phosphor-icons/react'

export function LegalBrandHeader() {
  return (
    <div className="flex items-center gap-2.5 mb-8">
      <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <span className="text-lg font-semibold">SDental</span>
    </div>
  )
}

export function LegalBackLink() {
  return (
    <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-10">
      <ArrowLeft className="h-3.5 w-3.5" />
      Voltar
    </Link>
  )
}
