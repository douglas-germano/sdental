/**
 * Utilitários para exportação de dados
 */

/**
 * Exporta dados para formato CSV e faz download
 * @param data - Array de objetos a ser exportado
 * @param filename - Nome do arquivo (sem extensão)
 * @param headers - Headers customizados (opcional, usa keys do primeiro objeto por padrão)
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  headers?: Record<keyof T, string>
): void {
  if (!data || data.length === 0) {
    console.warn('Nenhum dado para exportar')
    return
  }

  // Usa headers customizados ou as keys do primeiro objeto
  const keys = headers ? Object.keys(headers) as (keyof T)[] : Object.keys(data[0]) as (keyof T)[]
  const headerLabels = headers
    ? Object.values(headers)
    : keys.map(key => String(key))

  // Escapa valores CSV (aspas duplas e quebras de linha)
  const escapeCsvValue = (value: any): string => {
    if (value === null || value === undefined) return ''

    const stringValue = String(value)

    // Se contém vírgula, quebra de linha ou aspas, envolve em aspas
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
      return `"${stringValue.replace(/"/g, '""')}"`
    }

    return stringValue
  }

  // Cria as linhas CSV
  const csvRows: string[] = []

  // Adiciona header
  csvRows.push(headerLabels.map(escapeCsvValue).join(','))

  // Adiciona dados
  data.forEach(row => {
    const values = keys.map(key => escapeCsvValue(row[key]))
    csvRows.push(values.join(','))
  })

  // Junta tudo em uma string
  const csvContent = csvRows.join('\n')

  // Adiciona BOM para UTF-8 (garante acentos corretos no Excel)
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

  // Cria link de download
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}-${getTimestamp()}.csv`)
  link.style.visibility = 'hidden'

  // Adiciona ao DOM, clica e remove
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Libera o objeto URL
  window.URL.revokeObjectURL(url)
}

/**
 * Gera timestamp para nome de arquivo (YYYY-MM-DD-HHmmss)
 */
function getTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`
}

/**
 * Exporta dados para JSON e faz download
 * @param data - Dados a serem exportados
 * @param filename - Nome do arquivo (sem extensão)
 */
export function exportToJSON(data: any, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })

  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}-${getTimestamp()}.json`)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  window.URL.revokeObjectURL(url)
}

/**
 * Copia texto para clipboard
 * @param text - Texto a ser copiado
 * @returns Promise que resolve quando copiado com sucesso
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    } else {
      // Fallback para navegadores mais antigos
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      textArea.style.top = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)

      return successful
    }
  } catch (error) {
    console.error('Erro ao copiar para clipboard:', error)
    return false
  }
}
