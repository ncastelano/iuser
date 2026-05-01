//components/vitrine/LoadingSpinner.tsx

export function LoadingSpinner() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <div className="relative">
                <div className="w-16 h-16 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                </div>
            </div>
        </div>
    )
}   