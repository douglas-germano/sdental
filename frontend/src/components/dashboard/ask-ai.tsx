'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { analyticsApi } from '@/lib/api'
import { Sparkle, PaperPlaneTilt, CircleNotch as Loader2 } from '@phosphor-icons/react'
import { getErrorMessage } from '@/lib/error-messages'

const SUGGESTIONS = [
  'Como foi meu último mês?',
  'Qual minha taxa de faltas?',
  'Quais serviços mais agendam?',
]

export function AskAI() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ask = async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      const res = await analyticsApi.ask(trimmed)
      setAnswer(res.data.answer)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
            <Sparkle className="h-4 w-4 text-primary" />
          </div>
          Pergunte à IA sobre sua clínica
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(question)
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex: por que caíram as consultas este mês?"
            maxLength={500}
            className="flex-1 px-4 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" variant="gradient" disabled={loading || !question.trim()} className="gap-2 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="h-4 w-4" />}
            Perguntar
          </Button>
        </form>

        {!answer && !loading && !error && (
          <div className="flex flex-wrap gap-2 mt-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s)
                  ask(s)
                }}
                className="text-xs px-3 py-1.5 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive mt-4">{error}</p>
        )}

        {answer && (
          <div className="mt-4 p-4 rounded-xl bg-muted/40 border border-border/50 text-sm text-foreground whitespace-pre-line leading-relaxed">
            {answer}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
