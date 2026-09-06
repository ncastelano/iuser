'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Star, X, Car, ArrowRight } from 'lucide-react'
import { RideReviewModal } from './RideReviewModal'
import { motion, AnimatePresence } from 'framer-motion'

interface PendingRideReview {
    rideRequestId: string
    counterpartId: string
    counterpartName: string
}

export function FinishedRideTrigger() {
    const [pending, setPending] = useState<PendingRideReview[]>([])
    const [reviewTarget, setReviewTarget] = useState<PendingRideReview | null>(null)
    const [showPrompt, setShowPrompt] = useState(false)

    const checkRides = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: completedRides } = await supabase
            .from('ride_requests')
            .select('id, requester_id, driver_id')
            .or(`requester_id.eq.${user.id},driver_id.eq.${user.id}`)
            .eq('status', 'completed')

        if (!completedRides || completedRides.length === 0) {
            setPending([])
            setShowPrompt(false)
            return
        }

        const { data: myReviews } = await supabase
            .from('ride_reviews')
            .select('ride_request_id')
            .eq('reviewer_id', user.id)

        const reviewedIds = new Set((myReviews || []).map((r) => r.ride_request_id))
        const dismissedIds = new Set(JSON.parse(localStorage.getItem('dismissed_ride_reviews') || '[]'))

        const unreviewed = completedRides.filter((r) => !reviewedIds.has(r.id) && !dismissedIds.has(r.id) && r.driver_id)

        if (unreviewed.length === 0) {
            setPending([])
            setShowPrompt(false)
            return
        }

        const counterpartIds = Array.from(
            new Set(unreviewed.map((r) => (r.requester_id === user.id ? r.driver_id : r.requester_id)))
        ) as string[]
        const { data: profiles } = await supabase.from('profiles').select('id, name, profileSlug').in('id', counterpartIds)
        const profilesById = new Map((profiles || []).map((p) => [p.id, p]))

        const list: PendingRideReview[] = unreviewed.map((r) => {
            const counterpartId = (r.requester_id === user.id ? r.driver_id : r.requester_id) as string
            const p = profilesById.get(counterpartId)
            return {
                rideRequestId: r.id,
                counterpartId,
                counterpartName: p?.name || (p?.profileSlug ? `@${p.profileSlug}` : 'Motorista/Passageiro'),
            }
        })

        setPending(list)
        setShowPrompt(list.length > 0)
    }

    useEffect(() => {
        checkRides()
    }, [])

    const handleClose = () => {
        const current = pending[0]
        if (current) {
            const dismissedIds = JSON.parse(localStorage.getItem('dismissed_ride_reviews') || '[]')
            dismissedIds.push(current.rideRequestId)
            localStorage.setItem('dismissed_ride_reviews', JSON.stringify(dismissedIds))
            checkRides()
        }
    }

    const handleStartReview = () => {
        const current = pending[0]
        if (current) {
            setReviewTarget(current)
            setShowPrompt(false)
        }
    }

    return (
        <>
            <AnimatePresence>
                {showPrompt && pending.length > 0 && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-orange-500 to-red-600" />

                            <button
                                onClick={handleClose}
                                className="absolute right-4 top-4 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors z-20"
                            >
                                <X size={18} className="text-white" />
                            </button>

                            <div className="relative pt-20 px-8 pb-8 text-center">
                                <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto mb-6 -mt-10 border-4 border-orange-50">
                                    <Car size={40} className="text-orange-500" />
                                </div>

                                {pending.length > 1 && (
                                    <div className="inline-block px-3 py-1 bg-orange-100 rounded-full text-[10px] font-black text-orange-600 uppercase mb-4 tracking-wider">
                                        {pending.length} corridas pendentes
                                    </div>
                                )}

                                <h3 className="text-2xl font-black italic text-gray-900 leading-tight mb-2">
                                    Corrida finalizada! 🚗
                                </h3>
                                <p className="text-sm text-gray-500 font-medium leading-relaxed mb-8">
                                    Como foi sua experiência com {pending[0].counterpartName}? Avalie agora!
                                </p>

                                <div className="space-y-3">
                                    <button
                                        onClick={handleStartReview}
                                        className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 group"
                                    >
                                        Avaliar Agora <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                    </button>
                                    <button
                                        onClick={handleClose}
                                        className="w-full py-3 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-all"
                                    >
                                        Avaliar depois
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {reviewTarget && (
                <RideReviewModal
                    isOpen={true}
                    onClose={() => {
                        setReviewTarget(null)
                        setShowPrompt(pending.length > 0)
                    }}
                    rideRequestId={reviewTarget.rideRequestId}
                    revieweeId={reviewTarget.counterpartId}
                    revieweeName={reviewTarget.counterpartName}
                    onSuccess={() => {
                        setReviewTarget(null)
                        checkRides()
                    }}
                />
            )}
        </>
    )
}
