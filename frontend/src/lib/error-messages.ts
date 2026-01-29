/**
 * Mapeia códigos de erro da API para mensagens amigáveis em português
 */

const errorMessages: Record<string, string> = {
  // Erros de autenticação
  'UNAUTHORIZED': 'Você não tem permissão para realizar esta ação',
  'INVALID_CREDENTIALS': 'E-mail ou senha inválidos',
  'TOKEN_EXPIRED': 'Sua sessão expirou. Por favor, faça login novamente',
  'INVALID_TOKEN': 'Token de autenticação inválido',

  // Erros de validação
  'INVALID_PHONE': 'Número de telefone inválido',
  'INVALID_EMAIL': 'Endereço de e-mail inválido',
  'REQUIRED_FIELD': 'Este campo é obrigatório',
  'INVALID_DATE': 'Data inválida',
  'INVALID_TIME': 'Horário inválido',

  // Erros de duplicação
  'DUPLICATE_ENTRY': 'Este registro já existe',
  'DUPLICATE_PHONE': 'Este telefone já está cadastrado',
  'DUPLICATE_EMAIL': 'Este e-mail já está cadastrado',
  'DUPLICATE_APPOINTMENT': 'Já existe um agendamento para este horário',

  // Erros de recursos não encontrados
  'NOT_FOUND': 'Recurso não encontrado',
  'PATIENT_NOT_FOUND': 'Paciente não encontrado',
  'APPOINTMENT_NOT_FOUND': 'Agendamento não encontrado',
  'PROFESSIONAL_NOT_FOUND': 'Profissional não encontrado',
  'CONVERSATION_NOT_FOUND': 'Conversa não encontrada',

  // Erros de rede
  'NETWORK_ERROR': 'Erro de conexão. Verifique sua internet e tente novamente',
  'TIMEOUT': 'A requisição demorou muito. Tente novamente',
  'SERVER_ERROR': 'Erro no servidor. Tente novamente mais tarde',

  // Erros de negócio
  'SLOT_NOT_AVAILABLE': 'Este horário não está mais disponível',
  'APPOINTMENT_PAST': 'Não é possível modificar agendamentos passados',
  'CANNOT_DELETE': 'Não é possível excluir este registro',
  'INVALID_STATUS_TRANSITION': 'Transição de status inválida',
  'PROFESSIONAL_UNAVAILABLE': 'Profissional não disponível neste horário',

  // Erros de limites
  'RATE_LIMIT_EXCEEDED': 'Muitas requisições. Aguarde um momento e tente novamente',
  'QUOTA_EXCEEDED': 'Limite de uso excedido',

  // Erros de arquivo
  'FILE_TOO_LARGE': 'Arquivo muito grande',
  'INVALID_FILE_TYPE': 'Tipo de arquivo inválido',
  'UPLOAD_FAILED': 'Falha no upload do arquivo',
}

/**
 * Retorna uma mensagem de erro amigável baseada no erro da API
 * @param error - Objeto de erro do Axios ou código de erro
 * @returns Mensagem de erro em português
 */
export function getErrorMessage(error: any): string {
  // Se é uma string simples, busca diretamente
  if (typeof error === 'string') {
    return errorMessages[error] || 'Ocorreu um erro inesperado'
  }

  // Tenta extrair o código do erro
  const errorCode =
    error?.response?.data?.code ||
    error?.response?.data?.error?.code ||
    error?.code ||
    error?.message

  // Se encontrou um código, retorna a mensagem correspondente
  if (errorCode && errorMessages[errorCode]) {
    return errorMessages[errorCode]
  }

  // Mensagens baseadas em status HTTP
  const status = error?.response?.status
  if (status) {
    switch (status) {
      case 400:
        return 'Requisição inválida. Verifique os dados e tente novamente'
      case 401:
        return 'Você precisa fazer login para continuar'
      case 403:
        return 'Você não tem permissão para realizar esta ação'
      case 404:
        return 'Recurso não encontrado'
      case 409:
        return 'Este registro já existe ou está em conflito'
      case 422:
        return 'Dados inválidos. Verifique os campos e tente novamente'
      case 429:
        return 'Muitas requisições. Aguarde um momento e tente novamente'
      case 500:
        return 'Erro no servidor. Tente novamente mais tarde'
      case 503:
        return 'Serviço temporariamente indisponível'
    }
  }

  // Erros de rede
  if (error?.message === 'Network Error' || !error?.response) {
    return 'Erro de conexão. Verifique sua internet e tente novamente'
  }

  // Fallback genérico
  return error?.response?.data?.message ||
         error?.message ||
         'Ocorreu um erro inesperado. Tente novamente'
}

/**
 * Verifica se um erro é de rede
 * @param error - Objeto de erro
 * @returns true se for erro de rede
 */
export function isNetworkError(error: any): boolean {
  return !error?.response || error?.message === 'Network Error'
}

/**
 * Verifica se um erro é de autenticação
 * @param error - Objeto de erro
 * @returns true se for erro de autenticação
 */
export function isAuthError(error: any): boolean {
  const status = error?.response?.status
  return status === 401 || status === 403
}
