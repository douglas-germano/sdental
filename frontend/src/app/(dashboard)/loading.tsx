import { PageLoader } from '@/components/ui/page-loader'

export default function DashboardLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <PageLoader message="Carregando..." size="lg" />
    </div>
  )
}
