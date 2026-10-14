# PROMPT DE EXPANSÃO — DERBY PVP (modo solo, som e online)

Este prompt continua o projeto **Derby PVP**, já construído a partir do primeiro prompt (fases 1 a 15). Leia o `CLAUDE.md` e o código atual antes de começar. Tudo o que estava definido continua valendo, exceto o que este documento muda explicitamente. Se algo daqui conflitar com o código existente de forma não prevista, pare e me pergunte antes de decidir.

Regras de trabalho iguais às anteriores: fases em ordem, `npm run build` sem erros e warnings, `npm run test` passando, roteiro de teste manual e commit ao fim de cada fase. Atualize o `CLAUDE.md` com tudo o que for adicionado aqui. Novos números ajustáveis vão para `src/config/constants.ts`.

### Resumo do que muda

1. **Menu principal** com três modos: 1 Jogador (Campeonato), 2 Jogadores (Local) e Online (Sala).
2. **Modo solo** em formato de campeonato mata-mata, com 2 dificuldades e um adversário controlado pela CPU.
3. **Efeitos sonoros** sintetizados por código (substituindo o `AudioManager` vazio).
4. **Modo online** para 2 pessoas por sala com código ou link, sem login.
5. **Mudança de regra:** a IA passa a poder dar carrinho, mas **somente o controlador CPU do adversário no modo solo** (seção 3). Os companheiros controlados por IA continuam sem carrinho.

---

## 1. Menu principal e modos

Depois da tela inicial, entra um **menu principal** no mesmo estilo 1930 (art déco, raios girando, boiling lines):

- **1 JOGADOR — CAMPEONATO**
- **2 JOGADORES — LOCAL** (o modo que já existe, sem nenhuma mudança)
- **ONLINE — SALA**

Navegação com qualquer um dos dois conjuntos de teclas e Enter. Crie um tipo `GameMode = 'solo' | 'local' | 'online'` passado entre cenas. A `MatchScene` recebe o modo e as "fontes de comando" de cada time (humano local, CPU ou jogador remoto), sem duplicar a lógica da partida.

### Fontes de comando
Refatore a entrada para que cada time receba comandos de uma interface comum por tick de simulação:

```ts
interface TeamCommand { moveX: number; moveY: number; passPressed: boolean;
  shootHeld: boolean; shootReleased: boolean; shootPressed: boolean; }
interface CommandSource { getCommand(tick: number): TeamCommand; }
```

Implementações: `LocalKeyboardSource` (um conjunto de teclas), `CombinedKeyboardSource` (os dois conjuntos juntos), `CpuSource` (seção 3) e `RemoteSource` (seção 6). A simulação não sabe de onde o comando veio.

---

## 2. Modo solo — Campeonato

### Controles
No modo solo, **os dois conjuntos de teclas funcionam ao mesmo tempo** para o mesmo jogador, sem escolha no menu: WASD + F (passe) + G (chute/dividida) e Setas + ; (passe) + . (chute/dividida). Se duas direções opostas forem pressionadas em conjuntos diferentes, elas se anulam normalmente. Mantenha o suporte ao `;` do ABNT2 (`Slash`) e ao americano (`Semicolon`).

O jogador humano é sempre o **time da esquerda no 1º tempo** (o J1), com as mesmas regras de troca de lado.

### Fluxo
1. **Escolha do time** (grade dos 8 times, como na seleção atual, com um só cursor).
2. **Escolha da dificuldade:** FÁCIL ou DIFÍCIL, com uma linha explicando cada uma.
3. **Sorteio do chaveamento:** os 7 outros times são distribuídos aleatoriamente em quartas de final (4 jogos). Mostre a chave inteira num cartaz estilo 1930 (moldura art déco, escudos, nomes), com uma animação de sorteio curta.
4. **Fase por fase (quartas → semifinal → final):**
   - O jogo do jogador é disputado normalmente (2 × 90 s, prorrogação 2 × 30 s sem gol de ouro e pênaltis, com o clima sorteado a cada partida).
   - Os **outros jogos da fase são simulados** (seção 2.2) e o resultado aparece na chave com placar, por exemplo `INT 2 × 1 CHE` ou `MIL 1 × 1 LIV (pên. 4 × 3)`.
   - Depois de cada vitória, a tela da chave é atualizada mostrando quem avançou e o próximo adversário.
5. **Derrota = eliminação:** cartão de intertítulo **"ELIMINADO"**, chave final com o caminho do jogador e opções **Novo campeonato** (volta à escolha de time) e **Menu principal**. Não há segunda chance.
6. **Título:** tela de **"CAMPEÃO!"** com um troféu dourado desenhado no estilo 1930 (com brilhos e boiling lines), o time do jogador comemorando e a torcida pulando. Opções: Novo campeonato e Menu principal.

A pausa funciona como no modo local, com uma opção extra: **Abandonar campeonato** (pede confirmação).

### 2.1. Dificuldades
Existem 3 níveis internos de CPU: **Fácil, Médio e Difícil**. O modo escolhido define o nível de cada fase:

| Modo | Quartas | Semifinal | Final |
|---|---|---|---|
| **FÁCIL** | Fácil | Médio | Médio |
| **DIFÍCIL** | Fácil | Médio | Difícil |

Mostre o nível do adversário na tela da chave antes de cada partida (por exemplo, três estrelas art déco preenchidas conforme o nível).

### 2.2. Jogos simulados
Função pura em `sim/tournament.ts`, testável e com RNG com semente:
- Gols de cada time sorteados por uma distribuição de Poisson com média 1,4.
- Empate: simula a disputa de pênaltis (5 cobranças com 75% de acerto cada e morte súbita) e registra o placar dos pênaltis.
- Sempre retorna um vencedor.
- Testes: a chave sempre tem 8 times distintos, o jogador nunca é simulado, todo jogo simulado tem vencedor e a mesma semente gera o mesmo campeonato.

---

## 3. Adversário CPU (modo solo)

O `CpuSource` controla o time adversário **como um jogador humano virtual**: usa as mesmas regras de troca automática de controle, os mesmos comandos (mover, passar, carregar e soltar chute, dar carrinho) e a mesma física. Ele **nunca** trapaceia: não tem velocidade extra, não lê as teclas do jogador e não altera a física.

**A dificuldade NÃO muda a velocidade dos jogadores nem o goleiro.** Em todos os níveis, velocidades e o goleiro IA são exatamente os do jogo atual. A dificuldade muda só duas coisas: **agressividade (passes, chutes e ataque)** e **carrinhos**.

### Comportamento do CPU
- **Com a bola:** conduz em direção ao gol desviando de marcadores (steering simples), passa quando está pressionado ou quando um companheiro está claramente em posição melhor (função de pontuação: espaço livre, distância ao gol e linha de passe sem adversário no caminho), e chuta quando está ao alcance e com ângulo aberto, escolhendo o canto mais longe do goleiro.
- **Sem a bola:** o jogador controlado pelo CPU pressiona o portador e tenta interceptar linhas de passe; no nível Médio e Difícil, tenta carrinhos.
- **Companheiros do CPU sem a bola:** usam a IA de posicionamento atual, mas nos níveis mais altos fazem mais infiltrações para o ataque (parâmetro de agressividade).
- **Humanização:** o CPU decide em intervalos (não a cada frame), tem tempo de reação e erro de mira, conforme a tabela.
- **Pênaltis:** quando o CPU cobra, escolhe o canto e a força com o erro do seu nível; o goleiro continua sendo a IA aleatória atual. Quando o jogador cobra, nada muda.

### Parâmetros por nível (em `constants.ts`, ajustáveis)

| Parâmetro | Fácil | Médio | Difícil |
|---|---|---|---|
| Tempo de reação | 0,35 s | 0,22 s | 0,12 s |
| Intervalo entre decisões | 0,40 s | 0,25 s | 0,15 s |
| Erro de mira no passe | ±14° | ±8° | ±4° |
| Erro de mira no chute | ±12° | ±7° | ±3,5° |
| Distância máxima para chutar | 9 m | 12 m | 15 m |
| Pressão no portador (distância que mantém) | 2,5 m | 1,6 m | 1,0 m |
| Infiltrações dos companheiros (agressividade) | baixa | média | alta |
| Chance de tentar carrinho numa oportunidade | 0% (nunca) | 15% | 35% |
| Erro de tempo no carrinho | — | ±0,08 s | ±0,04 s |

- O carrinho do CPU usa **a mesma mecânica** do humano (janela ativa de 0,12 s, punição de 0,8 s ao errar, recarga de 1,2 s). Com o erro de tempo, ele também erra e é punido.
- Testes: no nível Fácil o CPU nunca dá carrinho; a velocidade dos jogadores e os parâmetros do goleiro são idênticos nos três níveis; o CPU só envia comandos válidos.
- Depois de implementar, faça uma rodada de ajuste: o Fácil deve ser vencível por um iniciante, o Médio deve exigir atenção e o Difícil deve ser desafiador, mas justo.

---

## 4. Efeitos sonoros (sintetizados por código)

Substitua o `AudioManager` vazio por um sintetizador com **Web Audio API**, sem nenhum arquivo de áudio. Nada de música nem torcida ambiente nesta versão.

### Regras técnicas
- Um único `AudioContext`, criado/retomado (`resume()`) no **primeiro clique ou tecla** do usuário (política de autoplay dos navegadores).
- Cadeia: cada som → ganho do efeito → **filtro "rádio antigo"** sutil (passa-faixa leve, entre ~150 Hz e ~6 kHz) → ganho master → saída. Os timbres devem lembrar desenho animado de 1930, sem ficarem irritantes.
- Pan estéreo leve conforme a posição X da bola no campo (de -0,4 a 0,4).
- Limite de vozes simultâneas (no máximo 2 do mesmo tipo) para não estourar o volume.
- **Volume master** e **mudo** no menu de pausa, e a tecla **M** liga/desliga o som. Salve a preferência em `localStorage` (com try/catch).
- O som nunca pode atrasar ou travar a simulação.

### Os sons

| Evento | Descrição da síntese |
|---|---|
| **Chute** | "Tum" grave: seno com queda rápida de afinação (~180 → 60 Hz) mais um estalo curto de ruído filtrado. Volume e brilho proporcionais à força do chute. |
| **Passe** | Toque mais leve e curto que o chute, mais agudo (~260 → 120 Hz), com pouco ruído. |
| **Apito** | Dois osciladores próximos de ~2,8 kHz com trilo (vibrato rápido). Padrões: 1 apito curto na saída de bola, 2 curtos no fim de cada tempo, 3 (o último longo) no fim de jogo. |
| **Gol** | Sino brilhante (parciais inarmônicos com decaimento longo) seguido de um "apito de êmbolo" subindo, bem cartunesco, sincronizado com a entrada do "GOOOL!". |
| **Defesa** | "Tum" abafado das luvas mais um pequeno "boing" de mola de desenho animado. |

Dispare os sons a partir de **eventos da simulação** (uma lista de eventos por tick: `kick`, `pass`, `whistle`, `goal`, `save`), nunca de dentro da renderização. Isso é obrigatório para o online funcionar (seção 6).

---

## 5. Modo online — visão geral

- 2 pessoas, cada uma no seu computador, por **sala com código ou link**, sem login.
- Mesma partida do modo normal: 2 tempos de 90 s, prorrogação de 2 × 30 s sem gol de ouro e pênaltis.
- Conexão direta entre os navegadores via **WebRTC**, usando a biblioteca **PeerJS** em versão fixa (`peerjs@1.5.4`) com o servidor público gratuito de sinalização dela. Isso mantém o jogo 100% hospedado no GitHub Pages, sem servidor próprio.
- **Limitação conhecida:** sem servidor TURN, algumas redes muito restritivas (alguns ambientes corporativos ou de faculdade) podem não conectar. Nesse caso, mostre uma mensagem clara ("Não foi possível conectar. Tente outra rede.") em vez de travar.
- Em cada computador, **os dois conjuntos de teclas funcionam juntos** (como no solo), controlando o próprio time.

### Fluxo
1. **ONLINE — SALA** abre um submenu: **Criar sala** e **Entrar com código**.
2. **Criar sala:** gera um código de 5 caracteres sem letras ambíguas (sem 0/O, 1/I/L), mostrado bem grande, e um botão **Copiar link** (`.../?sala=CODIGO`). Quem cria é o **anfitrião** e joga com o time da esquerda no 1º tempo. A tela fica em "Aguardando adversário..." com animação 1930.
3. **Entrar com código:** campo para digitar o código (aceitando minúsculas), ou entrada automática quando o jogo é aberto pelo link com `?sala=`.
4. **Conexão:** handshake trocando a versão do jogo. Se as versões forem diferentes, avise e não inicie.
5. **Seleção de times online:** cada um escolhe o próprio time na própria tela, vendo a escolha do outro em tempo real. Mesmo time é permitido (o visitante usa o reserva, como já é a regra). O jogo começa quando os dois confirmam.
6. **VS e partida:** o clima é sorteado pelo anfitrião e enviado ao visitante.
7. **Fim:** tela de resultado com **Revanche** (só começa quando os dois aceitam, novo clima) e **Sair**.

### Regras do online
- **Não existe pausa** no online. Esc/P abre um pequeno menu sobreposto com **Sair da partida** (com confirmação), enquanto o jogo continua rodando.
- **Perder o foco da janela não pausa** a partida no online (diferente do modo local).
- **Queda de conexão:** a partida congela para os dois com o aviso "Adversário desconectado — aguardando (10)". Se ele voltar em até 10 s, a partida continua; senão, **vitória por W.O.** para quem ficou, com cartão de intertítulo.
- Mostre o **ping** em um canto discreto do placar (verde até 80 ms, amarelo até 150 ms, vermelho acima).

---

## 6. Online — arquitetura de rede

### Modelo: anfitrião autoritativo
- **O anfitrião roda a simulação oficial** (a mesma `sim/` de sempre). O visitante **não** simula a partida oficial.
- **O visitante envia seus comandos** (`TeamCommand`) para o anfitrião a cada tick, com número de tick. O anfitrião usa o comando mais recente recebido (o `RemoteSource`). Eventos de "acabou de apertar/soltar" (passe, soltar chute) precisam ser **acumulados até serem confirmados**, para nunca se perderem entre pacotes.
- **O anfitrião envia snapshots** do estado a 30 Hz: posições e velocidades de jogadores e bola, estados de animação, quem é o controlado de cada time, placar, relógio, fase da partida e a **lista de eventos** desde o último snapshot (com id único, para sons e efeitos não tocarem duas vezes).
- **O visitante renderiza por interpolação**, com um buffer de ~100 ms entre dois snapshots, para o movimento ficar suave.
- **Predição local leve** para o visitante: o jogador controlado por ele se move localmente na hora (para não sentir atraso no movimento) e é corrigido suavemente quando chega o snapshot. Bola, passes, chutes e carrinhos são sempre decididos pelo anfitrião.
- Use canal WebRTC confiável e ordenado para mensagens de controle (handshake, seleção, revanche, saída) e, se a PeerJS permitir, um canal não confiável para snapshots e comandos. Senão, use o confiável para tudo e mantenha os pacotes pequenos.

### Mensagens
- Defina todas as mensagens em `net/protocol.ts` como **tipos TypeScript com discriminador** (`type: 'hello' | 'select' | 'ready' | 'start' | 'input' | 'snapshot' | 'rematch' | 'leave' | 'ping'`), com número de versão do protocolo.
- Valide toda mensagem recebida antes de usar (formato e limites). Mensagem inválida é ignorada e registrada no console, nunca derruba o jogo.
- Arredonde números nos snapshots (por exemplo, 2 casas decimais) para reduzir o tamanho.

### Aba em segundo plano
O navegador congela o `requestAnimationFrame` em abas ocultas. Se a aba do **anfitrião** ficar oculta, a simulação precisa continuar: use um timer em **Web Worker** para manter os ticks a 60 Hz quando `document.hidden` for verdadeiro, voltando ao loop normal quando a aba reaparecer.

### Estrutura
```
src/net/
  protocol.ts      # tipos das mensagens + validação
  peer.ts          # criar/entrar na sala, conexão PeerJS, reconexão
  host.ts          # recebe comandos, envia snapshots
  guest.ts         # envia comandos, buffer de interpolação, predição
  roomCode.ts      # geração e normalização de códigos
```

### Testes
- Serialização e validação de todas as mensagens (inclusive rejeição de mensagens malformadas).
- Geração de código (5 caracteres, sem ambíguos) e normalização (minúsculas, espaços).
- Interpolação entre snapshots e tratamento de snapshot atrasado ou fora de ordem.
- Eventos com o mesmo id não disparam duas vezes.
- Comandos de "acabou de apertar" não se perdem quando há pacotes faltando.

Além dos testes automatizados, inclua no README como testar o online sozinho: abrir duas janelas do navegador (uma anônima) na mesma máquina, criar a sala em uma e entrar pela outra.

---

## 7. Fases da expansão

16. **Menu principal e refatoração dos modos:** `GameMode`, `CommandSource`, `CombinedKeyboardSource`. O modo local tem que continuar funcionando exatamente como antes (teste de regressão manual).
17. **Efeitos sonoros:** `AudioManager` sintetizado, eventos da simulação, volume, mudo e tecla M.
18. **CPU do adversário:** comportamento com e sem bola, carrinho, três níveis e testes. Partida avulsa de teste contra o CPU para ajuste.
19. **Campeonato:** escolha de time e dificuldade, sorteio, chave, jogos simulados, eliminação e tela de campeão.
20. **Online, conexão:** PeerJS, criar/entrar na sala, link, handshake, seleção de times online e tratamento de erros de conexão.
21. **Online, partida:** anfitrião autoritativo, snapshots, interpolação, predição, eventos, ping, queda de conexão com W.O., revanche e Web Worker para aba oculta.
22. **Polimento e deploy:** ajuste fino da dificuldade e do online, revisão de performance e deploy no GitHub Pages.

---

## 8. Checklist de aceitação da expansão

- [ ] Menu principal com os três modos; o modo local continua idêntico ao anterior.
- [ ] No solo, WASD+F+G e setas+;+. funcionam juntas, incluindo o `;` do ABNT2.
- [ ] Campeonato com sorteio, chave visível, outros jogos simulados com placar (e pênaltis quando houver) e eliminação na primeira derrota.
- [ ] FÁCIL: Fácil, Médio, Médio. DIFÍCIL: Fácil, Médio, Difícil. O nível aparece antes de cada partida.
- [ ] A dificuldade muda só a agressividade e os carrinhos; velocidade e goleiro são iguais em todos os níveis.
- [ ] O CPU usa as mesmas regras e física do humano, erra de forma natural e dá carrinho só no Médio e no Difícil.
- [ ] Tela de campeão com troféu e tela de eliminado com intertítulo.
- [ ] Sons de chute, passe, apito, gol e defesa sintetizados por código, com o clima de 1930, volume, mudo e tecla M.
- [ ] Online por código ou link, sem login, funcionando no GitHub Pages.
- [ ] Anfitrião autoritativo, movimento suave no visitante, nenhum passe ou chute perdido e sons sem duplicar.
- [ ] Sem pausa no online, W.O. após 10 s de desconexão, revanche com aceite dos dois e aviso claro quando a conexão não for possível.
- [ ] A partida online não trava quando a aba do anfitrião fica em segundo plano.
- [ ] Build sem erros, todos os testes passando, 60 fps estáveis e deploy funcionando.

nao cometa erros
