'use client'

import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { pipelineApi } from '@/lib/api'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import { useToast } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'

export interface Patient {
    id: string
    name: string
    phone: string
    email?: string
    updated_at: string
}

export interface Stage {
    id: string
    name: string
    color: string
    patients: Patient[]
    total_patients?: number
    has_more?: boolean
}

export interface KanbanBoardRef {
    refresh: () => void
}

export const KanbanBoard = forwardRef<KanbanBoardRef>((props, ref) => {
    const [stages, setStages] = useState<Stage[]>([])
    const [loading, setLoading] = useState(true)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [movingPatientId, setMovingPatientId] = useState<string | null>(null)
    const { toast } = useToast()

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Wait for 5px movement before activating drag, prevents accidental clicks
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    useEffect(() => {
        fetchBoard()
    }, [])

    // Expose refresh method to parent via ref
    useImperativeHandle(ref, () => ({
        refresh: () => {
            fetchBoard()
        }
    }))

    const fetchBoard = async () => {
        try {
            const response = await pipelineApi.getBoard()
            setStages(response.data.map((stage: any) => ({
                ...stage,
                // Ensure patients array exists
                patients: stage.patients || []
            })))
        } catch (error) {
            console.error("Error fetching board", error)
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar o quadro.',
                variant: 'error',
            })
        } finally {
            setLoading(false)
        }
    }

    const findStage = (id: string) => {
        return stages.find((stage) => stage.items?.some((item: any) => item.id === id) || stage.id === id)
    }

    // Find which stage a patient belongs to
    const findPatientStage = (patientId: string) => {
        return stages.find(stage => stage.patients.some(p => p.id === patientId))
    }

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string)
    }

    const handleDragOver = (event: DragOverEvent) => {
        // We only care about drag end for moving between columns logic simplicity
        // But drag over visual feedback is nice
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)

        if (!over) return

        const activeId = active.id as string
        const overId = over.id as string  // This might be a stage ID or a patient ID

        // Find source stage
        const sourceStage = findPatientStage(activeId)
        if (!sourceStage) return

        // Find target stage
        // If overId is a stage
        let targetStage = stages.find(s => s.id === overId)

        // If overId is another patient, find their stage
        if (!targetStage) {
            targetStage = findPatientStage(overId)
        }

        if (!targetStage) return

        // If same stage, do nothing (we don't persist reordering within column yet)
        if (sourceStage.id === targetStage.id) return

        // Mark patient as being moved
        setMovingPatientId(activeId)

        // Optimistically update UI
        const patientIndex = sourceStage.patients.findIndex(p => p.id === activeId)
        if (patientIndex === -1) {
            setMovingPatientId(null)
            return
        }

        const patient = sourceStage.patients[patientIndex]

        // Store previous state for potential rollback
        const previousStages = stages

        // Remove from source
        const newSourcePatients = [...sourceStage.patients]
        newSourcePatients.splice(patientIndex, 1)

        // Add to target
        const newTargetPatients = [...targetStage.patients, patient] // Add to end for simplicity

        // Update total counts
        const updatedStages = stages.map(s => {
            if (s.id === sourceStage.id) {
                return {
                    ...s,
                    patients: newSourcePatients,
                    total_patients: (s.total_patients || s.patients.length) - 1
                }
            }
            if (s.id === targetStage!.id) {
                return {
                    ...s,
                    patients: newTargetPatients,
                    total_patients: (s.total_patients || s.patients.length) + 1
                }
            }
            return s
        })

        setStages(updatedStages)

        // Call API
        try {
            await pipelineApi.movePatient(activeId, targetStage.id)

            toast({
                title: 'Sucesso',
                description: `Paciente movido para ${targetStage.name}.`,
                variant: 'success'
            })
        } catch (error: any) {
            console.error("Error moving patient", error)

            // Rollback to previous state
            setStages(previousStages)

            // More specific error message
            const errorMessage = error?.response?.data?.error || 'Não foi possível mover o paciente.'

            toast({
                title: 'Erro ao mover paciente',
                description: errorMessage,
                variant: 'error'
            })
        } finally {
            setMovingPatientId(null)
        }
    }

    const getActivePatient = () => {
        for (const stage of stages) {
            const found = stage.patients.find(p => p.id === activeId)
            if (found) return found
        }
        return null
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-full gap-4 overflow-x-auto pb-4">
                {stages.map((stage) => (
                    <KanbanColumn key={stage.id} stage={stage} />
                ))}
            </div>

            <DragOverlay dropAnimation={{
                sideEffects: defaultDropAnimationSideEffects({
                    styles: {
                        active: {
                            opacity: '0.5',
                        },
                    },
                }),
            }}>
                {activeId ? <KanbanCard patient={getActivePatient() as Patient} /> : null}
            </DragOverlay>
        </DndContext>
    )
})

KanbanBoard.displayName = 'KanbanBoard'
