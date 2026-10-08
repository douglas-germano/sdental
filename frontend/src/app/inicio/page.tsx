import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Check, MessageCircle, Users, Bell, Wallet, SlidersHorizontal } from 'lucide-react'
import styles from './landing.module.css'

export const metadata: Metadata = {
  title: 'SDental | WhatsApp e agenda para sua clínica — R$ 127/mês',
  description: 'Organize o atendimento da sua clínica: assistente no WhatsApp, agenda, pacientes e lembretes. Conheça o plano único do SDental por R$ 127 por mês.',
  alternates: { canonical: 'https://sdental.pages.dev/inicio' },
}

const features = [
  { icon: MessageCircle, title: 'Uma recepção que continua a conversa.', text: 'Prepare o assistente com as informações da clínica para responder dúvidas pelo WhatsApp. Assuma o atendimento quando precisar.', label: 'ATENDIMENTO' },
  { icon: CalendarDays, title: 'A agenda no centro da rotina.', text: 'Organize horários, profissionais e serviços. Acompanhe os agendamentos e ofereça um link para o paciente agendar.', label: 'AGENDAMENTO' },
  { icon: Users, title: 'Cada paciente com seu histórico.', text: 'Reúna os dados dos pacientes e acompanhe as conversas em um só lugar, com contexto para o próximo atendimento.', label: 'RELACIONAMENTO' },
  { icon: Bell, title: 'Lembretes com a cara da clínica.', text: 'Configure lembretes de consultas e mensagens de acompanhamento conforme a rotina da sua equipe.', label: 'ACOMPANHAMENTO' },
  { icon: Wallet, title: 'Mais clareza para a gestão.', text: 'Registre receitas e despesas e acompanhe o financeiro junto da operação da clínica.', label: 'FINANCEIRO' },
  { icon: SlidersHorizontal, title: 'Você define. O assistente segue.', text: 'Escolha o tom das respostas, informe serviços e regras, teste uma conversa e ative quando estiver pronto.', label: 'CONTROLE' },
]
const questions = [
  ['Preciso entender de inteligência artificial?', 'Não. A configuração é guiada: você conecta o WhatsApp, preenche as informações da clínica e testa as respostas antes de ativar.'],
  ['Como conecto o WhatsApp da clínica?', 'Na área do assistente, você inicia a conexão e escaneia o QR Code com o celular da clínica. Depois, configura as informações que o assistente usará no atendimento.'],
  ['Posso atender pessoalmente?', 'Sim. Você pode assumir uma conversa e pausar o assistente. A equipe continua no controle do atendimento.'],
  ['O que está incluído nos R$ 127 mensais?', 'O plano reúne o assistente de WhatsApp, as conversas, a agenda, o cadastro de pacientes, os lembretes e a gestão financeira do SDental. A cobrança é mensal.'],
  ['O que acontece depois de clicar em assinar?', 'Você cria a conta da clínica e segue para a área de assinatura, onde encontra o checkout para ativar o plano.'],
]

function Action({ children = 'Começar por R$ 127/mês', light = false }: { children?: React.ReactNode; light?: boolean }) {
  return <Link href="/register" className={`${styles.action} ${light ? styles.actionLight : ''}`}>{children}<ArrowRight size={18} aria-hidden="true" /></Link>
}

export default function LandingPage() {
  return <div className={styles.page}>
    <a href="#conteudo" className={styles.skip}>Ir para o conteúdo</a>
    <header className={styles.header}>
      <Link href="/inicio" className={styles.logo} aria-label="SDental — início"><Image src="/icon.png" alt="" width={40} height={40} unoptimized /><span>SDental<span className={styles.logoDot}>.</span></span></Link>
      <nav aria-label="Navegação principal" className={styles.nav}><a href="#recursos">O sistema</a><a href="#como-funciona">Como funciona</a><a href="#plano">O plano</a></nav>
      <Link href="/login" className={styles.login}>Entrar <ArrowRight size={16} aria-hidden="true" /></Link>
    </header>
    <main id="conteudo">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}><span className={styles.eyebrow}>PARA A ROTINA DA SUA CLÍNICA</span><h1 id="hero-title">Mais cuidado.<br />Menos tarefas<br /><span>entre você e<br className={styles.mobileBreak} /> o paciente.</span></h1><p>WhatsApp, agenda e pacientes no mesmo lugar. Deixe o SDental ajudar no atendimento e abra espaço para o que precisa de você.</p><div className={styles.heroActions}><Action /><a className={styles.textLink} href="#como-funciona">Conheça o sistema ↓</a></div><p className={styles.caption}>Um plano. R$ 127 por mês. Toda a rotina conectada.</p></div>
        <div className={styles.product} aria-label="Exemplo ilustrativo de atendimento e agenda"><div className={styles.productTop}><span className={styles.productMark}>S.</span><span>O cuidado começa<br /><strong>na primeira mensagem.</strong></span><MessageCircle size={30} aria-hidden="true" /></div><div className={styles.chat}><div className={styles.chatHeader}><span className={styles.avatar}>C</span><div><strong>Clínica • Recepção</strong><small>Assistente de atendimento</small></div><span className={styles.status}>Ativo</span></div><div className={styles.bubbleIn}>Olá! Vocês fazem limpeza dental?</div><div className={styles.bubbleOut}>Olá! Sim, esse é um dos serviços da clínica. Posso ajudar você a encontrar um horário?</div><div className={styles.bubbleIn}>Pode ser quinta de manhã?</div><div className={styles.bubbleOut}>Vamos conferir a disponibilidade na agenda. Você prefere um horário mais cedo?</div><div className={styles.chatFoot}><span>Equipe no controle da conversa</span><Users size={17} aria-hidden="true" /></div></div><div className={styles.appointment}><span className={styles.dateTile}>QUI<strong>15</strong></span><div><small>SUA ROTINA, ORGANIZADA</small><strong>Agenda e atendimento juntos</strong><span>Do primeiro contato à próxima consulta.</span></div><Check size={20} aria-hidden="true" /></div><small className={styles.example}>Exemplo ilustrativo · dados e conversa fictícios</small></div>
      </section>
      <div className={styles.strip}><span>Uma rotina mais simples, de ponta a ponta.</span><div><MessageCircle size={18} /> WhatsApp</div><div><CalendarDays size={18} /> Agenda</div><div><Users size={18} /> Pacientes</div><div><Wallet size={18} /> Gestão</div></div>
      <section id="recursos" className={styles.section}><div className={styles.sectionHeading}><span className={styles.eyebrow}>MENOS ABAS. MAIS CONTEXTO.</span><h2>O que sua clínica precisa.<br /><span>Em uma rotina que faz sentido.</span></h2><p>Da mensagem ao agendamento, cada etapa tem seu lugar. Sem espalhar o atendimento entre várias ferramentas.</p></div><div className={styles.features}>{features.map(({ icon: Icon, title, text, label }) => <article key={label} className={styles.feature}><Icon size={27} strokeWidth={1.5} aria-hidden="true" /><span className={styles.featureLabel}>{label}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
      <section id="como-funciona" className={styles.stepsSection}><div className={styles.stepsIntro}><span className={styles.eyebrow}>NO SEU RITMO</span><h2>Primeiro, prepare.<br />Depois, deixe fluir.</h2><p>O assistente aprende com as informações que você configura. Você testa antes de colocar no atendimento.</p><Action light /></div><ol className={styles.steps}>{[['Conecte o WhatsApp', 'Use o QR Code para conectar o número da clínica ao SDental.'], ['Dê contexto ao assistente', 'Informe serviços, horários, regras e o jeito que sua equipe atende.'], ['Teste e ative', 'Simule uma conversa, revise as respostas e ative. Pause ou assuma quando precisar.']].map(([title, text], i) => <li key={title}><span className={styles.stepNumber}>0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></section>
      <section id="plano" className={`${styles.section} ${styles.pricingSection}`}><div className={styles.priceIntro}><span className={styles.eyebrow}>UM PLANO PARA A SUA CLÍNICA</span><h2>Tudo junto.<br /><span>Um valor por mês.</span></h2><p>Atendimento, organização e gestão no mesmo sistema. Escolha o SDental e comece a preparar a rotina da sua clínica.</p><span className={styles.priceNote}>Assinatura mensal em reais.</span></div><article className={styles.priceCard}><div className={styles.planHeading}><h3>Plano SDental</h3><span>PLANO ÚNICO</span></div><div className={styles.price}><span>R$</span><strong>127</strong><span>/mês</span></div><p className={styles.billing}>R$ 127 cobrados mensalmente.</p><ul>{['Assistente de atendimento no WhatsApp', 'Conversas e atendimento pela equipe', 'Agenda, profissionais e serviços', 'Cadastro e acompanhamento de pacientes', 'Lembretes e mensagens de acompanhamento', 'Controle de receitas e despesas'].map(item => <li key={item}><Check size={18} aria-hidden="true" />{item}</li>)}</ul><Action>Assinar o SDental</Action><small>Crie sua conta e continue para a assinatura.</small></article></section>
      <section className={`${styles.section} ${styles.faqSection}`}><div><span className={styles.eyebrow}>ANTES DE COMEÇAR</span><h2>Dúvidas comuns.<br /><span>Respostas diretas.</span></h2></div><div className={styles.faq}>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className={styles.finalCta}><span className={styles.eyebrow}>SDENTAL</span><h2>Cuide da clínica.<br />E de quem chega até ela.</h2><Action light /></section>
    </main>
    <footer className={styles.footer}><div><strong>SDental.</strong><p>Atendimento e gestão para clínicas odontológicas.</p></div><nav aria-label="Links do rodapé"><Link href="/login">Entrar no sistema</Link><Link href="/termos">Termos de uso</Link><Link href="/privacidade">Privacidade</Link></nav><span>© {new Date().getFullYear()} SDental</span></footer>
  </div>
}
