'use client'

import { useState, useRef } from 'react'
import { KanbanBoard, KanbanBoardRef } from '@/components/pipeline/kanban-board'
import { ManageStagesModal } from '@/components/pipeline/manage-stages-modal'
import { Button } from '@/components/ui/button'
import { Columns, Settings } from 'lucide-react'

export default function PipelinePage() {
    const [manageModalOpen, setManageModalOpen] = useState(false)
    const boardRef = useRef<KanbanBoardRef>(null)

    const handleStagesSaved = () => {
        // Trigger board refresh
        if (boardRef.current) {
            boardRef.current.refresh()
        }
    }

    return (
        <div className="h-[calc(100vh-6rem)] flex flex-col space-y-4 animate-fade-in">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                        <Columns className="h-6 w-6 text-primary" />
                        CRM & Pipeline
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Gerencie o fluxo de atendimento dos seus pacientes
                    </p>
                </div>

                <Button
                    onClick={() => setManageModalOpen(true)}
                    variant="outline"
                    size="sm"
                >
                    <Settings className="w-4 h-4 mr-2" />
                    Gerenciar Estágios
                </Button>
            </div>

            <div className="flex-1 overflow-hidden rounded-xl border border-border/50 bg-muted/10 p-4">
                <KanbanBoard ref={boardRef} />
            </div>

            <ManageStagesModal
                open={manageModalOpen}
                onOpenChange={setManageModalOpen}
                onSave={handleStagesSaved}
            />
        </div>
    )
}
