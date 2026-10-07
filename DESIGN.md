# SDental — sistema visual

Adaptação do documento `DESIGN-starbucks.md` fornecido por Douglas. A referência
orienta a atmosfera, as cores, a geometria e a interação; o produto continua sendo
um sistema de gestão e atendimento odontológico, com nome e identidade SDental.

## Direção

Ambiente acolhedor, legível e organizado: base quente, cartões brancos, ações verdes
e áreas de navegação em verde profundo. A composição segue a densidade de um
sistema de trabalho. Não reproduzir a estrutura comercial, imagens, logotipos,
copys, produtos ou elementos de recompensas da Starbucks.

## Cores por função

| Token | Cor clara | Uso |
|---|---|---|
| background | #f2f0eb | Fundo principal quente |
| ceramic / secondary / muted | #edebe9 | Áreas de apoio, abas e cabeçalhos de tabelas |
| card / popover | #ffffff | Formulários, cartões e modais |
| brand / primary-shade | #006241 | Títulos e realce da marca |
| primary | #00754a | Ações principais e foco |
| house / charcoal | #1e3932 | Navegação, acesso e destaque operacional |
| uplift | #2b5148 | Verde intermediário e superfícies escuras de apoio |
| mint | #d4e9e2 | Seleção, contraste suave e controles em áreas escuras |
| foreground | #24352f | Texto principal |
| muted-foreground | #59655f | Ajuda, descrições e metadados |
| destructive | #b42e24 | Erros e ações destrutivas |
| warning | #93611d | Alertas operacionais, sempre com rótulo |
| info | #46677a | Informação sem confundir com ação ou sucesso |

O dourado de recompensas não é um destaque do SDental. Âmbar é reservado a alertas.
Cores escolhidas pelo usuário para profissionais e etapas do funil são dados e
permanecem independentes da paleta da interface.

`globals.css` define os tokens e uma variante escura correspondente. As classes
`app-sidebar` e `brand-panel` ajustam os contrastes de textos e controles nas áreas
verdes. Evitar branco sobre menta e texto verde escuro sobre verde escuro.

## Tipografia e escala

Manrope substitui a fonte proprietária SoDoSans, conforme alternativa prevista na
referência. Uma única família cobre o sistema; os contextos que justificavam serifas
e fontes manuscritas no documento original não existem neste produto.

- Corpo: 16px / 24px; controles: 14px; metadados: 13px; microtexto: 12px.
- Título de página: 24px, semibold e verde de marca.
- Títulos de cartões: 18px, semibold; números usam alinhamento tabular.
- Tracking moderado: -0.01em. Evitar títulos pesados ou grandes nas telas de trabalho.
- Preservar a raiz de 16px: o ajuste comercial de 62,5% quebraria as unidades do app.

## Componentes

- Ações usam cápsulas de 50px e pressão com `scale(0.95)` em 200ms.
- Ação principal: verde preenchido. Secundária: contorno verde. Destrutiva: vermelho.
- Botões pequenos permanecem compactos no desktop; no celular atingem pelo menos
  44px nos componentes compartilhados. Ícones usam formas circulares.
- Cartões e modais: 12px. Campos: 10px, altura padrão de 44px, rótulos explícitos.
  Os rótulos permanecem visíveis para facilitar o preenchimento de dados clínicos.
- Campos inválidos recebem borda e leve fundo vermelho, além da mensagem de erro.
- Seleção de abas usa cápsulas dentro de uma área neutra. Etapas guiadas e opções
  de personalidade permanecem cartões selecionáveis, não botões de compra.
- Tabelas usam separadores discretos, cabeçalho cerâmico e realce leve no hover.
- Elevação: duas camadas de sombra suave; evitar sombras pesadas e gradientes de marca.
- Estados de sucesso, alerta e erro continuam identificados por texto ou ícone.

## Composição

A navegação usa verde profundo e seleção menta; a visão geral começa em uma área
verde com a data e ações da clínica. O conteúdo operacional fica em branco sobre
creme. Telas de acesso usam a mesma relação entre área verde e formulário claro.

Espaçamento: escala de 4/8/16/24/32px, cartões em 24px e margens menores no celular.
O layout, as rotas, as permissões e os fluxos continuam próprios do SDental. Não
introduzir fotografias de produtos, CTA flutuante de compras ou ornamentos de café.

## Acessibilidade e manutenção

Verificar texto normal com contraste mínimo de 4,5:1, foco visível, navegação pelo
teclado e largura de 390px sem rolagem horizontal da página. Dados tabulares podem
ter rolagem local quando necessária. Respeitar `prefers-reduced-motion` e usar
fontes de 16px nos campos móveis para evitar zoom involuntário.

Novas telas devem consumir os tokens e componentes compartilhados. Não inserir
cores de marca diretamente nas páginas. Preservar cores semânticas e cores que
representam dados do usuário.
