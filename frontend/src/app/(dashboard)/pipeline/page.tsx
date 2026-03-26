'use client'

import { useState, useRef, useEffect } from 'react'
import { KanbanBoard, KanbanBoardRef } from '@/components/pipeline/kanban-board'
import { ManageStagesModal } from '@/components/pipeline/manage-stages-modal'
import { AddPatientModal } from '@/components/pipeline/add-patient-modal'
import { LinkPatientModal } from '@/components/pipeline/link-patient-modal'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Columns, Settings, UserPlus, Link2 } from 'lucide-react'
import { pipelineApi } from '@/lib/api'

import { PipelineStage } from '@/types'

export default function PipelinePage() {
    const [manageModalOpen, setManageModalOpen] = useState(false)
    const [addPatientModalOpen, setAddPatientModalOpen] = useState(false)
    const [linkPatientModalOpen, setLinkPatientModalOpen] = useState(false)
    const [stages, setStages] = useState<PipelineStage[]>([])
    const boardRef = useRef<KanbanBoardRef>(null)

    useEffect(() => {
        fetchStages()
    }, [])

    const fetchStages = async () => {
        try {
            const response = await pipelineApi.getStages()
            setStages(response.data)
        } catch (error) {
            console.error('Error fetching stages:', error)
        }
    }

    const handleStagesSaved = () => {
        // Trigger board refresh and refetch stages
        if (boardRef.current) {
            boardRef.current.refresh()
        }
        fetchStages()
    }

    const handlePatientAdded = () => {
        // Trigger board refresh
        if (boardRef.current) {
            boardRef.current.refresh()
        }
    }

    return (
        <div className="h-[calc(100vh-7rem)] flex flex-col gap-6">
            <PageHeader title="CRM & Pipeline" description="Gerencie o fluxo de atendimento dos seus pacientes" className="flex-shrink-0">
                <Button
                    onClick={() => setAddPatientModalOpen(true)}
                    variant="default"
                    size="sm"
                    className="gap-2"
                >
                    <UserPlus className="w-4 h-4" />
                    Novo Paciente
                </Button>
                <Button
                    onClick={() => setLinkPatientModalOpen(true)}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                >
                    <Link2 className="w-4 h-4" />
                    Vincular Paciente
                </Button>
                <Button
                    onClick={() => setManageModalOpen(true)}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                >
                    <Settings className="w-4 h-4" />
                    Gerenciar Estagios
                </Button>
            </PageHeader>

            <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-muted/10 p-4">
                <KanbanBoard ref={boardRef} />
            </div>

            <ManageStagesModal
                open={manageModalOpen}
                onOpenChange={setManageModalOpen}
                onSave={handleStagesSaved}
            />

            <AddPatientModal
                open={addPatientModalOpen}
                onOpenChange={setAddPatientModalOpen}
                onSuccess={handlePatientAdded}
                stages={stages}
            />

            <LinkPatientModal
                open={linkPatientModalOpen}
                onOpenChange={setLinkPatientModalOpen}
                onSuccess={handlePatientAdded}
                stages={stages}
            />
        </div>
    )
}
