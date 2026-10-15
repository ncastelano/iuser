// src/modules/chat/ui/GroupAvatar.tsx — o "rosto" de um grupo: círculo degradê do iUser com o ícone de pessoas
import { Users } from 'lucide-react'

export default function GroupAvatar({ size = 48 }: { size?: number }) {
    return (
        <span
            className="rounded-full flex items-center justify-center text-white flex-shrink-0"
            style={{ width: size, height: size, background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
        >
            <Users size={size * 0.46} />
        </span>
    )
}
