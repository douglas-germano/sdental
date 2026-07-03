import { LegalBrandHeader, LegalBackLink } from '@/components/legal/legal-chrome'

export const metadata = {
  title: 'Política de Privacidade - SDental',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <LegalBrandHeader />

        <h1 className="text-2xl font-bold text-foreground mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-10">Última atualização: julho de 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Quem somos</h2>
            <p className="text-muted-foreground leading-relaxed">
              O SDental é uma plataforma de gestão para clínicas odontológicas que auxilia no agendamento de
              consultas e na comunicação com pacientes via WhatsApp. Esta política explica como coletamos,
              usamos e protegemos os dados pessoais tratados na plataforma, em conformidade com a Lei Geral
              de Proteção de Dados Pessoais (Lei nº 13.709/2018 - LGPD).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. Quais dados coletamos</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground leading-relaxed">
              <li>Dados de identificação: nome completo, telefone (WhatsApp) e, opcionalmente, e-mail.</li>
              <li>Dados de agendamento: serviços solicitados, datas e horários de consultas, observações informadas.</li>
              <li>Conteúdo de conversas trocadas via WhatsApp com a clínica, incluindo mensagens de texto, imagens, áudios e documentos enviados.</li>
              <li>Dados da clínica: nome, e-mail, telefone e configurações da conta de quem administra a plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. Para que usamos esses dados</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground leading-relaxed">
              <li>Viabilizar o agendamento e a gestão de consultas odontológicas.</li>
              <li>Permitir que a clínica (ou seu assistente de inteligência artificial) se comunique com o paciente via WhatsApp.</li>
              <li>Enviar confirmações e lembretes de consulta, por WhatsApp e/ou e-mail.</li>
              <li>Cumprir obrigações legais e regulatórias aplicáveis a serviços de saúde.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Base legal para o tratamento</h2>
            <p className="text-muted-foreground leading-relaxed">
              Tratamos seus dados pessoais com base no seu consentimento (Art. 7º, I da LGPD), fornecido no
              momento do agendamento ou do primeiro contato via WhatsApp, e na execução do contrato de
              prestação de serviços odontológicos entre você e a clínica (Art. 7º, V da LGPD).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Com quem compartilhamos seus dados</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              Para operar a plataforma, utilizamos os seguintes prestadores de serviço, que processam dados
              pessoais em nosso nome:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground leading-relaxed">
              <li><strong>Evolution API</strong> - gateway de integração com o WhatsApp, usado para troca de mensagens.</li>
              <li><strong>Anthropic (Claude)</strong> - inteligência artificial usada para interpretar e responder mensagens automaticamente, quando esse recurso está ativado pela clínica.</li>
              <li><strong>Brevo</strong> - envio de e-mails transacionais (confirmações, lembretes e redefinição de senha).</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Não vendemos nem compartilhamos seus dados pessoais com terceiros para fins de publicidade.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Seus direitos como titular</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              Nos termos do Art. 18 da LGPD, você pode solicitar à clínica, a qualquer momento:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground leading-relaxed">
              <li>Confirmação da existência de tratamento e acesso aos seus dados.</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
              <li>Portabilidade dos seus dados a outro fornecedor de serviço, mediante exportação em formato legível.</li>
              <li>Eliminação (anonimização) dos dados pessoais tratados com base no seu consentimento.</li>
              <li>Revogação do consentimento a qualquer momento.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Essas solicitações podem ser feitas diretamente à clínica onde você é atendido, que possui
              ferramentas na plataforma para exportar ou excluir seus dados pessoais.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Retenção de dados</h2>
            <p className="text-muted-foreground leading-relaxed">
              Mantemos seus dados pessoais pelo tempo necessário para cumprir as finalidades descritas nesta
              política, ou até que você solicite a eliminação dos seus dados, observadas eventuais obrigações
              legais de retenção de prontuários e registros de saúde.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Segurança</h2>
            <p className="text-muted-foreground leading-relaxed">
              Adotamos medidas técnicas e organizacionais para proteger seus dados pessoais contra acessos não
              autorizados e situações de destruição, perda, alteração ou comunicação indevida, incluindo
              senhas com hash criptográfico e conexões seguras (HTTPS).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato
              diretamente com a clínica onde você é atendido.
            </p>
          </section>
        </div>

        <LegalBackLink />
      </div>
    </div>
  )
}
