import Link from 'next/link'
import { LegalBrandHeader, LegalBackLink } from '@/components/legal/legal-chrome'

export const metadata = {
  title: 'Termos de Uso - SDental',
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <LegalBrandHeader />

        <h1 className="text-2xl font-bold text-foreground mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-10">Última atualização: julho de 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Aceitação dos termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ao utilizar a plataforma SDental, seja como clínica administradora ou como paciente agendando uma
              consulta, você concorda com estes Termos de Uso e com a nossa{' '}
              <Link href="/privacidade" className="text-primary hover:underline">Política de Privacidade</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. Descrição do serviço</h2>
            <p className="text-muted-foreground leading-relaxed">
              O SDental é uma plataforma de software como serviço (SaaS) que oferece a clínicas odontológicas
              ferramentas de gestão de pacientes, agendamento online e comunicação automatizada via WhatsApp,
              podendo utilizar inteligência artificial para responder mensagens quando esse recurso estiver
              ativado pela clínica.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. Cadastro e responsabilidade da conta</h2>
            <p className="text-muted-foreground leading-relaxed">
              A clínica é responsável por manter a confidencialidade das credenciais de acesso à plataforma e
              por todas as atividades realizadas em sua conta. A clínica é responsável por garantir que possui
              base legal adequada para tratar os dados pessoais de seus pacientes coletados através da
              plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Agendamento online</h2>
            <p className="text-muted-foreground leading-relaxed">
              Pacientes que utilizam a página pública de agendamento fornecem seus dados voluntariamente e
              consentem com o tratamento desses dados para fins de agendamento e comunicação relacionada à
              consulta, conforme descrito na Política de Privacidade.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Uso aceitável</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">Ao usar a plataforma, você concorda em não:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground leading-relaxed">
              <li>Utilizar o serviço para enviar mensagens não solicitadas (spam) via WhatsApp.</li>
              <li>Tentar acessar dados de outras clínicas ou pacientes sem autorização.</li>
              <li>Utilizar a plataforma para fins ilegais ou que violem direitos de terceiros.</li>
              <li>Tentar burlar ou comprometer os mecanismos de segurança da plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Disponibilidade do serviço</h2>
            <p className="text-muted-foreground leading-relaxed">
              Envidamos esforços para manter a plataforma disponível e funcionando corretamente, mas não
              garantimos disponibilidade ininterrupta. A integração com o WhatsApp depende de serviços de
              terceiros que estão fora do nosso controle direto.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Limitação de responsabilidade</h2>
            <p className="text-muted-foreground leading-relaxed">
              O SDental é uma ferramenta de apoio à gestão administrativa da clínica e não substitui o
              julgamento clínico profissional. A clínica permanece integralmente responsável pelo atendimento,
              diagnóstico e tratamento oferecidos aos seus pacientes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Alterações destes termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Podemos atualizar estes Termos de Uso periodicamente. Alterações significativas serão
              comunicadas através da plataforma ou por e-mail.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Em caso de dúvidas sobre estes Termos de Uso, entre em contato com a equipe do SDental ou com a
              clínica onde você é atendido.
            </p>
          </section>
        </div>

        <LegalBackLink />
      </div>
    </div>
  )
}
