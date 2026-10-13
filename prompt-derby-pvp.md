# PROMPT — DERBY PVP

Você vai construir do zero o **Derby PVP**, um jogo de futebol 5x5 para navegador, para 2 jogadores locais no mesmo teclado, com visual no estilo dos desenhos animados dos anos 1930 (o mesmo estilo que o jogo Cuphead homenageia). Leia este documento inteiro antes de escrever qualquer código. Todas as decisões abaixo são intencionais: siga-as à risca. Se algo estiver ambíguo ou impossível, pare e me pergunte antes de inventar uma solução.

---

## 0. Como trabalhar

1. Antes de codar, crie um arquivo `CLAUDE.md` na raiz com um resumo deste documento (stack, controles, regras, estilo, fases). Ele será a referência do projeto.
2. Desenvolva **fase por fase** (seção 14). Não pule fases e não comece a próxima antes de a atual passar em todos os critérios de verificação.
3. Ao final de cada fase:
   - rode `npm run build` (TypeScript em modo `strict`, zero erros e zero warnings);
   - rode `npm run test` (Vitest, todos os testes passando);
   - descreva o que eu devo testar manualmente no navegador;
   - faça um commit com mensagem clara (`fase 3: movimento dos jogadores`).
4. Todos os números ajustáveis (velocidades, tempos, tamanhos, probabilidades) ficam em `src/config/constants.ts`, nunca espalhados pelo código.
5. Separe **simulação** (lógica pura, sem Phaser, testável) de **renderização** (Phaser). A simulação nunca importa Phaser.
6. Nada de som nesta versão. Crie apenas um `AudioManager` com métodos vazios (`play(eventName)`) chamado nos pontos certos (chute, passe, gol, apito), para adicionar áudio depois sem refatorar.

---

## 1. Stack técnica

- **Linguagem:** TypeScript (modo `strict`).
- **Engine:** Phaser 3, versão fixa `3.80.1` (sem `^` no package.json).
- **Build:** Vite. `base: './'` no `vite.config.ts` para funcionar em qualquer subpasta do GitHub Pages.
- **Testes:** Vitest para toda a lógica de simulação.
- **Fontes:** carregadas via pacotes `@fontsource` (empacotadas no build, sem depender de CDN). Títulos: **Limelight** (art déco). Números e textos: **Oswald**. Aguarde `document.fonts.ready` antes de iniciar a primeira cena.
- **Resolução lógica:** 1280 x 720, `Phaser.Scale.FIT` + `CENTER_BOTH`, fundo preto nas bordas. `pixelArt: false`, antialias ligado.
- **Taxa de simulação:** passo fixo de 1/60 s com acumulador (a física não pode depender do FPS do monitor).
- **Hospedagem:** GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml` usando `actions/upload-pages-artifact` e `actions/deploy-pages`, publicando a pasta `dist`). Inclua no README o passo a passo para ativar o Pages (Settings → Pages → Source: GitHub Actions).

### Estrutura de pastas

```
src/
  main.ts
  config/constants.ts        # todos os números ajustáveis
  data/teams.ts              # 8 times: nomes, uniformes, escudos
  data/sponsors.ts           # placas de patrocínio
  core/projection.ts         # mundo -> tela (única fonte da perspectiva)
  core/input.ts              # mapeamento de teclado dos 2 jogadores
  core/rng.ts                # gerador aleatório com seed
  sim/                       # lógica pura (sem Phaser)
    ball.ts  player.ts  physics.ts  possession.ts
    control.ts  tackle.ts  ai.ts  goalkeeper.ts
    match.ts  penalties.ts  kits.ts
  art/                       # desenho procedural das texturas
    style.ts  player-art.ts  crest-art.ts  stadium-art.ts
    crowd-art.ts  sponsor-art.ts  film-fx.ts  ui-art.ts
  render/                    # sprites Phaser que espelham a simulação
  scenes/
    BootScene.ts  TitleScene.ts  TeamSelectScene.ts  VersusScene.ts
    MatchScene.ts  PauseScene.ts  ResultScene.ts
  audio/AudioManager.ts      # stub vazio
tests/
```

---

## 2. Controles (crítico)

| Ação | Jogador 1 (time da esquerda) | Jogador 2 (time da direita) |
|---|---|---|
| Mover | W A S D | Setas |
| Passe | F | ; (ponto e vírgula) |
| Chute (segurar carrega) / Dividida sem bola | G | . (ponto) |
| Pausa | Esc ou P (qualquer jogador) | Esc ou P |

Regras de implementação do teclado:

1. Use **`KeyboardEvent.code`** para letras e setas (`KeyW`, `KeyA`, `KeyS`, `KeyD`, `KeyF`, `KeyG`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Period`).
2. **Atenção ao teclado brasileiro ABNT2:** nele, a tecla `;` fica ao lado do `.` e tem `code = "Slash"`. No teclado americano, `;` tem `code = "Semicolon"`. O passe do Jogador 2 deve aceitar **as duas**: `Slash` OU `Semicolon` OU `event.key === ';'`. A tecla `.` é `Period` nos dois layouts.
3. Chame `preventDefault()` em setas, espaço, `Slash` e `Period` (setas rolam a página; no Firefox, `/` abre a busca rápida e rouba o foco).
4. Os dois jogadores precisam funcionar **ao mesmo tempo**, com várias teclas pressionadas simultaneamente. Leia o estado das teclas por frame (pressionada / acabou de pressionar / acabou de soltar), não apenas eventos isolados.
5. Movimento em 8 direções; diagonais normalizadas (não pode andar mais rápido na diagonal).
6. Ao perder o foco da janela (`blur`), solte todas as teclas e pause a partida.
7. Menus também são navegáveis pelos dois: J1 usa W/S/A/D + F (confirmar) + G (voltar); J2 usa setas + ; (confirmar) + . (voltar). Enter também confirma.
8. No README, avise que alguns teclados baratos não registram muitas teclas ao mesmo tempo (ghosting), o que não é bug do jogo.

---

## 3. Campo, mundo e perspectiva

### Mundo (simulação)

- Unidades em metros. Campo de **40 x 20 m** (padrão futsal). Eixo X ao longo do comprimento (gols nas extremidades esquerda e direita), eixo Y na largura (0 = fundo/longe, 20 = frente/perto da câmera), eixo Z = altura.
- Gols nas pontas, centralizados em Y: **3 m de largura x 2 m de altura**, com 1 m de profundidade.
- Área do goleiro: semicírculo de 6 m de raio a partir do centro do gol. Círculo central de 3 m. Linha do meio.
- **Paredes em volta de todo o campo** (estilo arcade): a bola nunca sai e quica nelas. A única abertura é a boca de cada gol. Atrás e acima do gol há parede, então a bola que passa por cima do travessão quica de volta.
- Postes e travessão têm colisão própria (a bola pode bater na trave).

### Projeção (visão inclinada entre lateral e top-down)

Toda conversão mundo → tela passa por **uma única função** em `core/projection.ts`. Nada de desenhar posições "na mão".

```
t      = y / 20                               // 0 = fundo, 1 = frente
s      = lerp(0.86, 1.0, t)                   // escala por profundidade (perspectiva leve)
telaX  = centroX + (x - 20) * PPM * s
telaY  = topoCampo + y * PPM * 0.6 * lerp(0.92, 1.0, t) - z * PPM * s
escalaSprite = s
```

- `PPM` (pixels por metro) e `topoCampo` devem ser calculados para que **o campo inteiro sempre fique visível**, ocupando cerca de 85% da largura da tela, com espaço para o placar no topo e a arquibancada do fundo.
- O campo vira um trapézio leve (mais estreito no fundo), dando profundidade.
- **Ordenação por profundidade:** sprites ordenados por Y do mundo (quem está mais à frente aparece por cima). A bola usa o Y dela no chão, não a altura.
- Cada jogador e a bola têm **sombra elíptica** no chão. A bola no ar sobe na tela, mas a sombra fica no chão (isso mostra a altura).
- **Câmera fixa** mostrando tudo. Só o tremor de tela no gol mexe nela.
- A parede da frente (perto da câmera) é baixa e semitransparente para nunca esconder jogadores.

---

## 4. Times e jogadores

- 5 por time, numerados: **Goleiro (1), Fixo (4), Ala direito (7), Ala esquerdo (11), Atacante (9)**.
- Formação base (para o time que ataca para a direita; espelhe para o outro): Goleiro (1.5, 10), Fixo (9, 10), Ala esquerdo (15, 4), Ala direito (15, 16), Atacante (18.5, 10).
- Corpo dos jogadores: círculo de colisão de 0,4 m de raio. Jogadores se empurram (separação suave), mas **encostar no adversário não rouba a bola**. Só a dividida rouba.
- Velocidade de corrida: 6,5 m/s. Com a bola: 90% disso. Aceleração rápida, mas não instantânea (resposta firme, sem "deslizar no gelo").

---

## 5. Bola, posse, passe e chute

### Física da bola
- Posição (x, y, z) e velocidade (vx, vy, vz).
- Rolando: amortecimento exponencial (`v *= exp(-1.1 * dt)`), parando abaixo de 0,15 m/s.
- No ar: gravidade 20 m/s² (valor de jogo, mais "arcade"). Quique no chão com restituição 0,5.
- Paredes e traves: restituição 0,7.
- **Gol:** quando a bola cruza completamente a linha do gol, entre os postes e com `z` abaixo de 2 m.

### Posse (condução)
- Um jogador ganha a posse se a bola estiver a menos de 0,6 m dos pés dele, com `z < 0,5 m` e velocidade relativa abaixo de 9 m/s. Se vier mais rápida, a bola desvia dele.
- Com posse, a bola fica "presa" 0,45 m à frente do jogador, na direção em que ele está virado, com um leve balanço de condução.
- Depois de passar ou chutar, o jogador não pode recuperar a bola por 0,25 s.
- Disputa de bola solta: fica com o mais próximo.

### Passe (F / ;)
- Escolhe o companheiro dentro de um cone de 60° na direção do direcional pressionado (ou na direção em que o jogador está virado, se nada estiver pressionado). Pontuação = ângulo (peso maior) + distância.
- Velocidade do passe proporcional à distância (passe rasteiro, entre 7 e 16 m/s), mirando um pouco à frente do receptor se ele estiver correndo.
- Se não houver companheiro no cone, a bola é tocada reta naquela direção.
- **Assim que o passe sai, o controle troca para o receptor.**

### Chute (G / .) com carga
- Segurar carrega a força de 0 a 100% em 0,9 s (trava em 100%). Soltar chuta.
- Barra de força visível perto dos pés do jogador (seção 10).
- Velocidade: de 9 m/s (0%) a 24 m/s (100%).
- Direção: a do direcional pressionado. Sem direcional, vai em direção ao centro do gol adversário. Se o direcional estiver a até 45° do gol, aplique uma leve correção (25%) em direção à boca do gol.
- Altura: acima de 50% de carga, a bola ganha `vz` proporcional (chutes fortes sobem). Acima de 85%, aumenta a imprecisão angular aleatória (risco de isolar por cima ou pela lateral). Chute fraco é preciso e rasteiro.
- Se o jogador perder a bola enquanto carrega, a carga é cancelada.

---

## 6. Troca automática de controle

- Cada humano controla sempre **um** jogador de linha do seu time. **O goleiro é sempre IA** e nunca é controlado.
- Com posse do time: controla quem está com a bola.
- Sem posse: controla o jogador de linha mais próximo da **posição prevista** da bola (posição + velocidade × 0,3 s).
- **Histerese**, para não ficar piscando: só troca se o novo candidato estiver pelo menos 1 m mais perto que o atual, e no máximo uma troca a cada 0,25 s. Exceção: troca imediata quando um companheiro recebe passe ou ganha a bola.
- A carga de chute é cancelada se o controle trocar.

### Indicador (estilo FIFA)
- Triângulo acima da cabeça do jogador controlado, **apontando para baixo**, flutuando levemente (sobe e desce).
- Cor = cor principal do uniforme que o time está usando. Contorno escuro de 2 px (`#1A1410`) mais um filete creme interno. Isso garante leitura nos times de camisa branca.

---

## 7. Dividida (carrinho)

Apertar o botão de chute **sem a bola** faz uma dividida. Ela deve ser possível, mas não fácil.

- Desliza 2,5 m na direção do movimento (ou na que o jogador está virado) em 0,35 s.
- A **janela ativa** (quando a dividida pode acertar) dura só 0,12 s, no meio do deslize. Fora dela, encostar não faz nada.
- Hitbox: círculo de 0,45 m na ponta do pé.
- **Acertou a bola de quem conduz:** a bola sai solta na direção do carrinho a 6 m/s e o adversário cambaleia 0,5 s (sem controle).
- **Acertou bola solta:** empurra a bola na direção do carrinho.
- **Errou:** o jogador fica caído 0,8 s sem poder se mexer (punição clara, visível na animação).
- Recarga de 1,2 s entre divididas. Sem faltas: nunca há marcação.
- A IA **não** dá carrinho.
- Escreva testes que provem a janela ativa (acerto dentro, nenhum efeito fora).

---

## 8. Inteligência artificial (simples)

Os 4 jogadores não controlados de cada time e os 2 goleiros são IA.

### Jogadores de linha
- Ficam na sua posição da formação, deslocada em direção à bola (30% do deslocamento da bola em X, 20% em Y), sempre presos a uma zona por função (o fixo não passa muito do meio, o atacante não recua até a própria área, os alas ficam nos lados).
- **Defesa:** quando o adversário tem a bola, o IA de linha cuja zona contém o portador se coloca entre o portador e o próprio gol, a cerca de 2 m dele, bloqueando o caminho (sem carrinho). Os demais fecham o meio.
- **Ataque:** quando o próprio time tem a bola, abrem espaço avançando suavemente para as posições de ataque.
- Bola solta perto de um IA: pela troca automática, quem chega primeiro já passa a ser controlado pelo humano. O IA nunca fica conduzindo a bola.

### Goleiro
- Fica perto da linha, acompanhando o Y da bola (limitado à largura do gol mais 0,5 m) e sai um pouco quando a bola se aproxima. Preso à área.
- Tempo de reação de 0,15 s (com uma pequena variação aleatória) para reagir a chutes.
- Se uma bola vem em direção ao gol e está ao alcance, ele se estica/mergulha. Bola até 15 m/s: **segura**. Acima: **espalma** para o lado.
- Com a bola nas mãos: segura por 1 s (adversários não podem roubar) e lança, por cima (com altura), para o companheiro de linha mais livre.
- O goleiro deve ser bom, mas batível: chutes fortes no canto e chutes rápidos depois de troca de lado precisam ter chance real de entrar. Ajuste com testes.

---

## 9. Regras e fluxo da partida

### Máquina de estados (`sim/match.ts`)
`SAIDA_DE_BOLA → JOGANDO → COMEMORACAO_GOL → SAIDA_DE_BOLA ...`, mais `INTERVALO`, `PRORROGACAO`, `PENALTIS`, `FIM`.

- **Tempo normal:** 2 tempos de 90 s cada.
- **O relógio só corre em `JOGANDO`** (para na comemoração, na saída de bola e na pausa).
- **Saída de bola:** todos voltam à formação. A bola fica no centro, com o atacante do time que tomou o gol (no início: J1 no 1º tempo, J2 no 2º). Contagem curta de 1 s antes de liberar.
- **Intervalo:** cartão de intertítulo (seção 11) por 2 s. **Os times trocam de lado no 2º tempo** e na 2ª metade da prorrogação.
- **Empate no fim do tempo normal:** prorrogação de 2 tempos de 30 s, **sem gol de ouro** (gol não encerra a partida; joga-se o tempo todo).
- **Empate após a prorrogação:** pênaltis.
- **Fim:** tela de resultado.

### Pênaltis (`sim/penalties.ts`)
- Série de 5 cobranças alternadas (J1 começa). Se um time não puder mais alcançar o outro, encerra antes. Persistindo o empate: alternadas, morte súbita.
- Batedores em rodízio: Atacante, Ala esquerdo, Ala direito, Fixo e repete.
- **Batedor (humano):** um cursor de mira se move pela boca do gol com esquerda/direita do jogador. O cursor tem um leve balanço automático, o que torna os cantos extremos mais arriscados. Segurar o chute carrega a força: força baixa = rasteiro e fácil de pegar; força alta = mais rápido e alto; acima de 90%, risco crescente de isolar por cima do travessão. Prazo de 5 s; se estourar, chuta automaticamente com a carga atual.
- **Goleiro (IA aleatória):** no momento do chute, escolhe esquerda / centro / direita (probabilidades 40/20/40) e mergulha. Defende se escolheu a mesma zona da bola e a bola não está nos 15% externos da largura do gol. Bolas muito fortes na zona certa têm 35% de chance de passar mesmo assim.
- Placar dos pênaltis no topo: círculos (cheio = gol, X = perdido).

---

## 10. Interface da partida (estilo transmissão de TV)

- **Barra no topo**, centralizada: escudo J1 · sigla J1 · placar · sigla J2 · escudo J2, com o relógio e o período abaixo (`1T 01:12`, `2T`, `PR1`, `PR2`, `PÊN`).
- Visual art déco anos 1930: placa creme com contorno escuro, cantos ornamentados, números em Oswald, siglas em Limelight.
- Durante os pênaltis, mostrar os círculos de cada série.
- **Barra de força do chute:** pequena barra curva (arco) aos pés do jogador controlado, na cor do time, aparecendo só enquanto carrega e piscando ao chegar em 100%.

---

## 11. Direção de arte — estilo animação de 1930

Tudo é **desenhado por código** (Phaser Graphics → `generateTexture` no carregamento). Nenhuma imagem externa. Referência: desenhos animados de 1930 (rubber hose) e Cuphead. O objetivo é ficar bonito e coerente, nunca tosco ou sem contexto: todo elemento (campo, placas, placar, menus, torcida) segue a mesma linguagem visual.

### Linguagem geral
- **Cores vivas e saturadas** (à la Cuphead), com sombras em tom mais frio (não preto). Contornos sempre em marrom quase preto `#1A1410`, com espessura variável (mais grossa embaixo e nas curvas, como pincel).
- **Linha que "ferve" (boiling line):** cada elemento animado tem 3 variações do desenho com os pontos de controle levemente deslocados (±1,5 px), alternando a ~12 vezes por segundo. Isso vale para jogadores, bola, traves, torcida e indicador.
- **Animação dos personagens a 12–15 quadros por segundo** (troca de pose), enquanto posição e física continuam suaves a 60 fps.
- Exagero de animação clássica: esticar ao chutar, achatar ao frear, antecipação antes da ação.

### Jogadores (estilo híbrido)
- Corpo atlético estilizado, com proporção legível em campo, e **braços e pernas de "mangueira"** (curvas de Bézier, sem cotovelos ou joelhos rígidos), balançando de forma elástica.
- Cabeça um pouco maior que o realista, **olhos "pie-cut"** (oval com uma fatia recortada, marca registrada de 1930), nariz em ponto, sorriso simples. Tons de pele variados entre os jogadores.
- Chuteiras pretas grandes e arredondadas. O goleiro tem **luvas grandes e arredondadas**.
- Uniforme desenhado em camadas: camisa (com o padrão do time: listras, gola, punhos), calção, meias, número nas costas.
- Vistas: lateral (espelhada para os dois lados), de frente e de costas; diagonais usam a mais próxima.
- Animações: parado (2 quadros), correndo (6), conduzindo (6), passe (3), chute (4, com antecipação), carrinho (2), caído (2), cambaleando (2), comemorando (4 a 6), e goleiro: posição de espera, mergulho (3), defesa segurando (2) e lançamento (3).
- **Gere as texturas só dos dois times da partida** (nos uniformes que vão ser usados), no início do jogo, com tela de carregamento estilizada, para não pesar.

### Bola
Clássica de couro de gomos, creme com costuras escuras, contorno fervendo e rotação visual proporcional à velocidade.

### Campo
- Gramado vibrante com **faixas de corte** alternando dois verdes, textura sutil de papel envelhecido por cima, linhas brancas levemente irregulares (como desenhadas à mão).
- Gols com traves brancas fervendo e rede em perspectiva (linhas cruzadas). A rede balança quando sai gol.
- Paredes em volta como placas de madeira pintada.

### Estádio e torcida
- **Arquibancada cheia** no fundo (topo da tela) e nas laterais (parcial), sem nunca cobrir o campo.
- Torcida **dividida ao meio**: metade com as cores do time do J1 e metade com as do J2 (seguindo o uniforme em campo), com bandeiras e cachecóis.
- Torcedores desenhados no estilo 1930 (cabeças redondas, olhos pie-cut, chapéus de época misturados), balançando em loop de poucos quadros. Use poucas texturas reaproveitadas, com variação de cor e posição, para manter a performance.
- Quando o time ataca perto do gol adversário, a torcida dele se agita mais. **No gol, a torcida do time que marcou pula e comemora** (braços para cima, bandeiras agitando).

### Placas de patrocínio
Ficam na parede do fundo, entre o campo e a arquibancada, e alternam a cada 8 s com uma animação de virada (como placa giratória de três faces), no estilo de cartaz pintado de 1930. Os logos são desenhados do zero, apenas **inspirados** nas marcas, nunca copiados:

| Placa | Texto | Visual |
|---|---|---|
| 1 | **Marlburo** | Vermelho e branco, com um formato de "telhado" triangular parecido, mas não idêntico |
| 2 | **bet366** | Verde e amarelo, tipografia própria |
| 3 | **Chopp Brama** | Clima de bar e chope, cores quentes, sem copiar o logo |
| 4 | **Asilo do Rods** | Exatamente esse nome, letras **azul e rosa** sobre **fundo branco** |
| 5 | **Miami Hot** | Chama estilizada em vermelho e preto, sem o logo da NBA |

### Clima (sorteado a cada partida, nunca muda a física)
Mostre o clima sorteado na tela de VS. Cada um muda iluminação, sombras e céu (faixa de céu visível acima da arquibancada):

1. **Dia ensolarado:** cores no máximo, sombras curtas, **sol com rosto sorridente** estilo 1930 e nuvens fofas.
2. **Pôr do sol:** filtro laranja/rosado, sombras longas e diagonais, sol baixo com rosto sonolento.
3. **Noite com refletores:** céu azul-escuro com estrelas e **lua com rosto**, 4 torres de refletores com cones de luz, e **4 sombras suaves por jogador** (uma por refletor).
4. **Dia chuvoso:** céu cinza, cores um pouco menos saturadas, chuva em traços diagonais desenhados (estilo animação antiga, com boiling), pequenos respingos no gramado e poças decorativas. **A chuva não altera nada na física.**

### Efeitos visuais
- **Rastro da bola** em chutes fortes (acima de 15 m/s): traços de "velocidade" de desenho animado atrás dela.
- **Partículas de grama** a cada poucos passos de corrida e um jato maior no carrinho.
- **Barra de força** do chute (seção 10).
- **Tremor de tela e flash** branco curto no gol.
- Linhas de impacto ao acertar um carrinho ou uma defesa do goleiro.

### Efeitos de filme antigo (camada por cima de tudo)
Implemente como camadas de overlay (texturas geradas por código), não como shader complexo:
- **Grão de película:** 4 texturas de ruído alternando rápido, com baixa opacidade.
- **Riscos verticais e pontinhos de poeira** aparecendo de vez em quando.
- **Flicker sutil:** variação de brilho global de ±3%, quase imperceptível.
- **Vinheta leve** nas bordas.
- **Textura de papel envelhecido** leve sobre campo e estádio.
- Os efeitos nunca podem prejudicar a leitura da bola, dos jogadores ou do placar. Há uma opção para desligar os efeitos de filme no menu de pausa (para PCs mais fracos).

### Comemoração de gol (~3 s)
Tudo ao mesmo tempo:
1. Texto **"GOOOL!"** gigante entrando com animação elástica de 1930 (letras que esticam e quicam), com contorno grosso e sombra.
2. O **jogador que marcou comemora** (pula, socando o ar, com os braços de mangueira girando).
3. A **parte da torcida do time** pula e agita bandeiras.
4. Tremor e flash de tela, rede balançando.

Depois, volta à saída de bola. Qualquer um dos dois botões de passe pula a comemoração após 1 s.

### Cartões de intertítulo
Transições ("FIM DO 1º TEMPO", "PRORROGAÇÃO", "PÊNALTIS", "FIM DE JOGO") usam o estilo dos **cartões de texto do cinema mudo**: fundo escuro, moldura ornamentada art déco, letras creme em Limelight, com grão e flicker.

---

## 12. Os 8 times

Nomes reais na tela; siglas no placar. Os **uniformes devem reproduzir fielmente** os uniformes reais (cores, padrão de listras, gola, calção, meias). Os **escudos são apenas o contorno do formato do escudo real, com leves marcas de semelhança dentro**, desenhados de forma simplificada no estilo do jogo (nunca uma cópia do escudo).

| Time | Sigla | Uniforme 1 (titular) | Uniforme 2 (reserva) | Escudo (contorno + marcas) |
|---|---|---|---|---|
| Palmeiras | PAL | Camisa verde `#006437` com gola e punhos brancos, calção branco, meias verdes | Camisa branca com detalhes verdes, calção verde, meias brancas | Contorno circular com anel; uma estrela pequena no topo e uma curva lembrando a letra "P" |
| Corinthians | COR | Camisa branca com gola preta, calção preto, meias brancas | Camisa preta com detalhes brancos, calção preto, meias pretas | Contorno circular com anel; dois remos cruzados simplificados |
| Barcelona | BAR | Listras verticais azul `#004D98` e grená `#A50044`, calção azul, meias azuis com faixa grená | Camisa amarela `#EDBB00` com detalhes grená, calção amarelo | Contorno do escudo em formato de "bulbo" com topo dividido; listras azul e grená na metade de baixo e uma pequena cruz no canto de cima |
| Real Madrid | RMA | Branco total com detalhes dourados `#FEBE10` | Camisa roxo-escuro `#4B2E83` com detalhes dourados | Contorno circular com uma coroa simplificada no topo; uma faixa diagonal dentro |
| Inter de Milão | INT | Listras verticais azul `#0068A8` e preto, calção preto, meias pretas | Camisa branca com detalhes azul e preto, calção branco | Contorno circular com anéis concêntricos azul e preto e um ponto no centro |
| AC Milan | MIL | Listras verticais vermelho `#FB090B` e preto, calção branco, meias pretas | Camisa branca com detalhes vermelho e preto, calção branco | Contorno oval; metade esquerda com listras vermelho e preto, metade direita com uma cruz vermelha sobre branco |
| Liverpool | LIV | Vermelho total `#C8102E` com detalhes brancos | Camisa branca com detalhes vermelhos, calção branco | Contorno de escudo com duas "chamas" nas laterais; uma silhueta de asa simplificada dentro |
| Chelsea | CHE | Camisa azul `#034694` com gola branca, calção azul, meias brancas | Camisa amarelo-claro com detalhes azuis, calção azul-escuro | Contorno circular com anel; um bastão vertical com ponta curva, sugerindo o leão com cajado |

Todo o conteúdo de times fica em `data/teams.ts`, fácil de editar.

### Conflito de cores (`sim/kits.ts`)
- Cada uniforme tem uma "cor de leitura" (média ponderada das cores que aparecem de longe).
- Se as cores de leitura dos titulares estiverem próximas demais (distância de cor perceptual abaixo de um limite em `constants.ts`), **o J2 usa o reserva**. Se ainda conflitar, o J1 também usa o reserva.
- **Obrigatório:** testes provando que estes confrontos trocam de uniforme: Corinthians × Real Madrid, Barcelona × Inter, Milan × Liverpool. E que Palmeiras × Corinthians não troca.
- Se os dois escolherem o mesmo time, o J2 usa o reserva.
- **Goleiros:** cada um recebe uma cor própria escolhida de uma lista (laranja, verde-limão, cinza, rosa, amarelo, preto), maximizando a diferença em relação aos dois uniformes de linha e ao outro goleiro.
- A torcida e o triângulo indicador sempre seguem o uniforme que está em campo.

---

## 13. Telas e menus

Todas no mesmo estilo 1930 (art déco, raios de sol girando ao fundo, boiling lines, grão).

1. **Tela inicial:** logo **"DERBY PVP"** grande em Limelight, com contorno grosso e brilho, sobre um fundo de raios girando. Abaixo, "Pressione ENTER" piscando. Uma pequena cena animada decorativa (uma bola quicando com rosto, por exemplo) dá personalidade.
2. **Seleção de times:** lado esquerdo J1, lado direito J2. Cada um navega pela grade de 8 times com seus próprios controles e confirma. Mostra o escudo, o nome e uma prévia do jogador com o uniforme. A partida começa quando os dois confirmam. O botão de voltar desfaz a confirmação.
3. **Tela VS:** escudos se chocando no centro, nomes dos times e o **clima sorteado** ("HOJE: NOITE DE REFLETORES") em estilo de cartaz, por 2,5 s.
4. **Partida.**
5. **Pausa** (Esc/P): escurece a partida com uma moldura art déco. Opções: Continuar, Reiniciar partida, Efeitos de filme (ligado/desligado), Sair para o menu.
6. **Resultado:** placar final (com pênaltis, se houver), vencedor em destaque com a torcida dele comemorando, e opções: Revanche (mesmos times, novo clima), Trocar times, Menu inicial.

---

## 14. Fases de desenvolvimento

Cada fase só termina quando `npm run build` e `npm run test` passam sem erros e eu consigo testar o que foi pedido.

1. **Base:** projeto Vite + TS strict + Phaser 3.80.1 + Vitest + workflow de deploy do GitHub Pages funcionando com uma tela de teste.
2. **Campo e projeção:** campo, linhas, gols e paredes desenhados com formas simples via `projection.ts`. Modo de depuração (tecla `` ` ``) mostrando hitboxes e coordenadas do mundo. Testes da projeção.
3. **Entrada e movimento:** módulo de input (incluindo `;` do ABNT2), os 10 jogadores como círculos coloridos, os dois humanos movendo jogadores ao mesmo tempo.
4. **Bola:** física, paredes, traves, altura e sombra, posse, condução, passe e chute com carga. Testes de física e posse.
5. **Gol e fluxo da partida:** detecção de gol (incluindo por cima do travessão), máquina de estados, relógio, intervalo, troca de lado, prorrogação e placar simples. Testes da máquina de estados.
6. **Troca automática** de controle com histerese e o triângulo indicador.
7. **Dividida** com janela ativa, punição e testes.
8. **IA** de linha e goleiros.
9. **Pênaltis** completos, com testes de rodízio, série de 5 e morte súbita.
10. **Arte dos jogadores e da bola:** desenho procedural rubber hose, uniformes dos 8 times, animações e boiling lines.
11. **Estádio:** gramado final, arquibancada com torcida dividida, placas de patrocínio girando e os 4 climas.
12. **Interface:** placar de TV, barra de força, escudos e intertítulos.
13. **Efeitos:** rastro, partículas, tremor e flash, comemoração completa e efeitos de filme.
14. **Menus:** tela inicial, seleção, VS, pausa e resultado.
15. **Polimento final:** ajuste de jogabilidade, revisão de performance (60 fps estáveis em notebook comum, sem vazamento de memória entre partidas) e deploy final.

---

## 15. Checklist de aceitação final

- [ ] Os dois jogadores jogam ao mesmo tempo no mesmo teclado, sem conflito de teclas, e o `;` funciona em teclado ABNT2 e americano.
- [ ] Setas, `/` e `.` não rolam a página nem abrem a busca do navegador.
- [ ] O campo inteiro está sempre visível, com perspectiva inclinada e ordenação de profundidade correta.
- [ ] A bola nunca sai do campo e o gol por cima do travessão não conta.
- [ ] O chute carrega com o tempo e a força é visível; chute muito forte arrisca isolar.
- [ ] A troca automática não fica piscando entre jogadores.
- [ ] A dividida acerta só na janela ativa e o erro é punido.
- [ ] O goleiro é IA, defende bem, mas é batível.
- [ ] 2 tempos de 90 s com troca de lado; prorrogação de 2 × 30 s sem gol de ouro; pênaltis com série de 5 e morte súbita.
- [ ] Os 8 uniformes fiéis aos reais, escudos em contorno com marcas leves, e troca automática para o reserva nos confrontos com cores parecidas.
- [ ] Clima aleatório entre os 4, sem afetar a física.
- [ ] Torcida dividida nas cores dos times, comemorando no gol junto com o jogador e o "GOOOL!".
- [ ] Placas de patrocínio alternando a cada 8 s, com os nomes da tabela.
- [ ] Estilo 1930 coerente em tudo: boiling lines, olhos pie-cut, membros de mangueira, grão, riscos, flicker, vinheta e intertítulos, sem prejudicar a leitura do jogo.
- [ ] Menu inicial, seleção de times, VS, pausa e resultado funcionando com os controles dos dois jogadores.
- [ ] Nenhum som, mas com o `AudioManager` pronto para receber áudio.
- [ ] Build sem erros, testes passando, 60 fps estáveis e deploy no GitHub Pages funcionando.

nao cometa erros
