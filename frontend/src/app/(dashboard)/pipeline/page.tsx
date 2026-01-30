'use client'

import { useState, useRef, useEffect } from 'react'
import { KanbanBoard, KanbanBoardRef } from '@/components/pipeline/kanban-board'
import { ManageStagesModal } from '@/components/pipeline/manage-stages-modal'
import { AddPatientModal } from '@/components/pipeline/add-patient-modal'
import { LinkPatientModal } from '@/components/pipeline/link-patient-modal'
import { Button } from '@/components/ui/button'
import { Columns, Settings, UserPlus, Link2 } from 'lucide-react'
import { pipelineApi } from '@/lib/api'

interface Stage {
    id: string
    name: string
    color: string
}

export default function PipelinePage() {
    const [manageModalOpen, setManageModalOpen] = useState(false)
    const [addPatientModalOpen, setAddPatientModalOpen] = useState(false)
    const [linkPatientModalOpen, setLinkPatientModalOpen] = useState(false)
    const [stages, setStages] = useState<Stage[]>([])
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
        <div className="h-[calc(100vh-3rem)] flex flex-col gap-4 animate-fade-in">
            <div className="flex items-start justify-between flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                        <Columns className="h-6 w-6 text-primary" />
                        CRM & Pipeline
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Gerencie o fluxo de atendimento dos seus pacientes
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => setAddPatientModalOpen(true)}
                        variant="default"
                        size="sm"
                    >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Novo Paciente
                    </Button>
                    <Button
                        onClick={() => setLinkPatientModalOpen(true)}
                        variant="outline"
                        size="sm"
                    >
                        <Link2 className="w-4 h-4 mr-2" />
                        Vincular Paciente
                    </Button>
                    <Button
                        onClick={() => setManageModalOpen(true)}
                        variant="outline"
                        size="sm"
                    >
                        <Settings className="w-4 h-4 mr-2" />
                        Gerenciar Estágios
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden rounded-xl border border-border/50 bg-muted/10 p-4">
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
