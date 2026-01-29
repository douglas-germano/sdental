'use client'

import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { KanbanCard } from './kanban-card'
import { Stage } from './kanban-board'
import { Badge } from '@/components/ui/badge'
import { MoreHorizontal } from 'lucide-react'

interface Props {
    stage: Stage
}

export function KanbanColumn({ stage }: Props) {
    const { setNodeRef, isOver } = useDroppable({
        id: stage.id,
    })

    // Custom color badge style
    const badgeStyle = {
        backgroundColor: stage.color + '20', // 20% opacity
        color: stage.color,
        borderColor: stage.color + '40'
    }

    return (
        <div className="flex-shrink-0 w-80 flex flex-col h-full rounded-xl bg-muted/30 border border-border/50">
            <div className="p-4 border-b border-border/50 flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-t-xl">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm tracking-tight">{stage.name}</h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={badgeStyle}>
                        {stage.patients.length}
                    </span>
                </div>
                <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                />
            </div>

            <div
                ref={setNodeRef}
                className={`flex-1 p-2 space-y-2 overflow-y-auto transition-colors ${isOver ? 'bg-muted/50' : ''
                    }`}
            >
                <SortableContext
                    items={stage.patients.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {stage.patients.map((patient) => (
                        <KanbanCard key={patient.id} patient={patient} />
                    ))}
                </SortableContext>

                {stage.patients.length === 0 && (
                    <div className="h-24 flex items-center justify-center text-xs text-muted-foreground border-2 border-dashed border-border/50 rounded-lg m-2">
                        Vazio
                    </div>
                )}

                {stage.has_more && (
                    <div className="mx-2 mb-2 p-2 text-center text-xs text-muted-foreground bg-muted/50 rounded-lg border border-border/50 flex items-center justify-center gap-2">
                        <MoreHorizontal className="w-3 h-3" />
                        <span>+{(stage.total_patients || 0) - stage.patients.length} pacientes</span>
                    </div>
                )}
            </div>
        </div>
    )
}
