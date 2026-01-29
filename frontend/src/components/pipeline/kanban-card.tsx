'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { Patient } from './kanban-board'
import { User, Phone, Calendar } from 'lucide-react'
import { formatPhone, formatDateTime } from '@/lib/utils'
import Link from 'next/link'

interface Props {
    patient: Patient
}

export function KanbanCard({ patient }: Props) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: patient.id,
        data: {
            type: 'Patient',
            patient,
        },
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="opacity-30 bg-muted rounded-xl h-24 border-2 border-dashed border-primary/50"
            />
        )
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <Card className="cursor-grab active:cursor-grabbing hover:shadow-md transition-all duration-200 border-border/50 bg-white group">
                <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                            {patient.name}
                        </span>
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{formatPhone(patient.phone)}</span>
                        </div>

                        {patient.updated_at && (
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDateTime(patient.updated_at)}</span>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
