# Atendimento no WhatsApp

A área `/agents` reúne conexão, preparação, teste e publicação. A conexão é
verificada periodicamente; respostas habilitadas e número conectado são estados
separados. A pausa mantém o rascunho e não desliga os envios iniciados pela clínica.

Estilos, dados da clínica e mensagens automáticas só são persistidos ao publicar.
O usuário precisa testar a configuração atual e confirmar a revisão. Publicar
mantém o estado das respostas; publicar e ativar exige conexão verificada também
no servidor. Alterações posteriores invalidam o teste anterior. A navegação avisa
sobre rascunhos pendentes.

Horários e serviços continuam nas configurações da clínica. Seus links abrem as
seções correspondentes. Instruções personalizadas e contexto existentes são
preservados. As informações estruturadas complementam esses campos; criatividade,
instruções e variáveis ficam em configurações avançadas.

O simulador usa sessões independentes por clínica, com o prefixo `TEST-` preservado.
Começar nova conversa troca a sessão e descarta a memória anterior. Ferramentas que
alteram dados ou encaminham para humanos são simuladas, inclusive quando o limite
de chamadas é atingido. Testes podem consultar disponibilidade e consomem o serviço
de IA configurado; não enviam WhatsApp nem criam agendamentos reais.

## Implantação

A migração `23_agent_setup` adiciona `clinics.agent_settings`, opcional. O script de
inicialização aplica a migração em bancos existentes; instalações vazias usam o
bootstrap já existente. Atualize o backend antes do frontend para disponibilizar
o novo contrato de configuração. Nenhuma configuração da clínica de produção é
alterada pelo commit.

## Validação

- Suite backend: `cd backend && pytest -q`.
- Frontend: `cd frontend && npm run lint && npx tsc --noEmit && npm run build`.
- Migração PostgreSQL local a partir de `22_security_hardening`, preservando dados.
- Navegador com APIs simuladas: QR code com falha e nova tentativa, rascunhos sem
  salvamento automático, inclusão e desfazer, teste obrigatório, sessões novas,
  ativação bloqueada sem conexão, pausa preservando rascunho, restauração da versão
  publicada, erros compreensíveis e largura de 390 px sem rolagem horizontal.

A revisão no navegador usa dados fictícios. Conexão real, qualidade das respostas
com o modelo em produção e recebimento de mensagens devem ser conferidos após o
deploy.
