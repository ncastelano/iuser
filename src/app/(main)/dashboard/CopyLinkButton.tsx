'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copyToClipboard}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition ${
        copied 
          ? 'bg-green-500/20 text-green-400 border-green-500/30' 
          : 'bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800'
      }`}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? 'Copiado!' : 'Copiar Link'}
    </button>
  )
}
