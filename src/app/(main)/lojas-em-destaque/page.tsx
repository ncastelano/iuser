// /lojas-em-destaque virou /lojas (a implementação mora em app/(main)/lojas/page.tsx). Mantido só para links antigos.
import { permanentRedirect } from 'next/navigation'

export default function LojasEmDestaqueRedirect() {
    permanentRedirect('/lojas')
}
