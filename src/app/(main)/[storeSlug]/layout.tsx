import MainLayout from '@/app/(main)/layout'
import { ReactNode } from 'react'

export default function StoreLayout({ children }: { children: ReactNode }) {
    return <MainLayout>{children}</MainLayout>
}
