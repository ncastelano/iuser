'use client'

import { useEffect, useState } from 'react'

type SnackbarProps = {
    message: string | null
    type?: 'success' | 'error'
}

export default function Snackbar({ message, type = 'success' }: SnackbarProps) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (!message) return

        setVisible(true)

        const timer = setTimeout(() => {
            setVisible(false)
        }, 4000)

        return () => clearTimeout(timer)
    }, [message])

    if (!visible || !message) return null

    return (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-md pointer-events-none">
            <div
                className={`px-4 py-3 rounded-none shadow-2xl flex items-center justify-center text-center font-bold tracking-tight border-l-4 ${
                    type === 'success'
                        ? 'bg-green-500 text-white border-green-700'
                        : 'bg-red-500 text-white border-red-700'
                } animate-in fade-in slide-in-from-bottom-4 duration-300`}
            >
                {message}
            </div>
        </div>
    )
}
