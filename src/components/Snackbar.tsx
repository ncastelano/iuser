'use client'

import { useEffect, useState } from 'react'

type SnackbarProps = {
    message: string
    type?: 'success' | 'error'
}

export default function Snackbar({ message, type = 'success' }: SnackbarProps) {
    const [visible, setVisible] = useState(true)

    useEffect(() => {
        const timer = setTimeout(() => {
            setVisible(false)
        }, 4000)

        return () => clearTimeout(timer)
    }, [])

    if (!visible) return null

    return (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-in">
            <div
                className={`px-4 py-3 rounded shadow-lg ${type === 'success'
                        ? 'bg-green-400 text-black'
                        : 'bg-red-500 text-white'
                    }`}
            >
                {message}
            </div>
        </div>
    )
}
