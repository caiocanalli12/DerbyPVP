# Derby PVP — referência do projeto

Jogo de futebol 5x5 para navegador, 2 jogadores locais no mesmo teclado, visual de desenho animado dos anos 1930 (rubber hose / Cuphead). A especificação completa e original está em `prompt-derby-pvp.md` e a da expansão (modos solo e online, som) em `prompt-derby-pvp-expansao.md` — **elas mandam**; este arquivo é o resumo de trabalho. Na dúvida ou se algo for impossível: parar e perguntar, não inventar.

## Regras de trabalho

- Desenvolver **fase por fase** (lista abaixo). Só começar a próxima quando a atual passar em tudo.
- Fim de cada fase: `npm run build` (TS strict, zero erros e zero warnings) → `npm run test` (Vitest, tudo passando) → descrever o teste manual no navegador → commit `fase N: descrição`.
- **Todo número ajustável** (velocidades, tempos, tamanhos, probabilidades) fica em `src/config/constants.ts`.
- **Simulação (`src/sim/`) é lógica pura**: nunca importa Phaser, é determinística (RNG com seed de `core/rng.ts`) e testável.
- Renderização (Phaser) só espelha a simulação. Toda conversão mundo → tela passa por `core/projection.ts`.
- Som só sintetizado (Web Audio, sem arquivos) e só a partir dos eventos da simulação (`match.sounds`), nunca da renderização. Sem música nem torcida ambiente.
- Nenhuma imagem externa: tudo desenhado por código no carregamento.

## Stack

- TypeScript `strict`, Phaser **3.80.1** fixo (sem `^`), Vite 6 (`base: './'`), Vitest 4.1 (fixo em `4.1.11`, roda sobre o Vite 6).
  - Node local é 20.15 → Vite 7 não roda; por isso Vite 6.x.
- Fontes via `@fontsource`: **Limelight** (títulos, siglas) e **Oswald** (números, textos). Esperar `document.fonts.ready` antes da primeira cena.
- Resolução lógica 1280x720, `Scale.FIT` + `CENTER_BOTH`, fundo preto, `pixelArt: false`, antialias ligado.
- Simulação em passo fixo de 1/60 s com acumulador (render interpola entre estados).
- Deploy: GitHub Pages via Actions (`.github/workflows/deploy.yml`, `upload-pages-artifact` + `deploy-pages`, pasta `dist`).

### Pastas
```
src/main.ts
src/config/constants.ts      números ajustáveis
src/data/teams.ts            8 times (nomes, siglas, uniformes, escudos)
src/data/sponsors.ts         placas de patrocínio
src/core/projection.ts       mundo -> tela (única fonte da perspectiva)
src/core/input.ts            teclado dos 2 jogadores
src/core/sources.ts          fontes de comando do teclado (por tick)
src/core/modes.ts            GameMode
src/core/rng.ts              RNG com seed
src/sim/                     lógica pura: ball, player, physics, possession, control,
                             tackle, ai, goalkeeper, match, penalties, kits, command
src/art/                     desenho procedural das texturas
src/render/                  sprites Phaser que espelham a simulação
src/scenes/                  Boot, Title, MainMenu, TeamSelect, Versus, Match, Pause, Result, Overlay
src/audio/                   AudioManager (Web Audio), synth (os 5 sons), settings, voices
tests/
```

## Controles

| Ação | J1 (time da esquerda) | J2 (time da direita) |
|---|---|---|
| Mover | W A S D | Setas |
| Passe / confirmar | F | `;` (`Slash` no ABNT2, `Semicolon` no US, ou `key === ';'`) |
| Chute (segurar carrega) / dividida sem bola / voltar | G | `.` (`Period`) |
| Pausa | Esc ou P | Esc ou P |

- Usar `KeyboardEvent.code`. `preventDefault()` em setas, espaço, `Slash`, `Period`.
- Estado por tecla lido por passo: pressionada / acabou de pressionar / acabou de soltar (com latch, para não perder toques entre passos fixos).
- 8 direções, diagonal normalizada. `blur` solta todas as teclas e pausa a partida.
- Menus: J1 = WASD + F confirma + G volta; J2 = setas + `;` confirma + `.` volta; Enter confirma. Na seleção de times, H (J1) e `,` (J2) trocam entre uniforme 1 e 2 (pedido do usuário).

## Mundo e perspectiva

- Metros. Campo 40 x 20 (X = comprimento, Y = largura, 0 = fundo / 20 = frente, Z = altura).
- Gols nas pontas, centrados em Y: 3 m x 2 m, 1 m de profundidade. Área = semicírculo de 6 m. Círculo central 3 m.
- Paredes em volta (bola nunca sai); única abertura é a boca do gol. Parede atrás/acima do gol. Postes e travessão colidem.
- Projeção: `t = y/20`, `s = lerp(0.86, 1, t)`, `telaX = cx + (x-20)·PPM·s`, `telaY = topo + y·PPM·0.6·lerp(0.92,1,t) − z·PPM·s`. PPM/topo calculados para o campo ocupar ~85% da largura.
- Ordenação por Y do mundo (bola usa o Y do chão). Sombras elípticas no chão. Câmera fixa (só treme no gol). Parede da frente baixa e semitransparente.

## Jogo

- 5 por time: Goleiro 1, Fixo 4, Ala direito 7, Ala esquerdo 11, Atacante 9. Formação (atacando para a direita): GK (1.5,10), Fixo (9,10), AE (15,4), AD (15,16), Atacante (18.5,10); espelhar para o outro.
- Raio de colisão 0,4 m, separação suave; encostar não rouba. Corrida 6,5 m/s; com bola 90%.
- Bola: rolando `v *= exp(-1.1·dt)`, para < 0,15 m/s; gravidade 20; quique chão 0,5; paredes/traves 0,7. Gol = cruzou totalmente a linha entre os postes com z < 2.
- Posse: < 0,6 m, z < 0,5, vel. relativa < 9 m/s (acima desvia). Bola 0,45 m à frente. Sem recuperar por 0,25 s após passar/chutar. Disputa: o mais próximo.
- Passe: cone 60°, pontuação ângulo (peso maior) + distância, rasteiro 7–16 m/s, mira à frente do receptor; sem alvo = toque reto. Controle troca na hora para o receptor.
- Chute: carga 0→100% em 0,9 s; 9→24 m/s; direção do direcional (ou centro do gol), correção de 25% para a boca se a até 45°; > 50% sobe; > 85% imprecisão. Perder a bola/trocar controle cancela a carga.
- Troca de controle: humano controla 1 jogador de linha (goleiro sempre IA). Com posse: o portador. Sem: mais perto da bola prevista (pos + vel·0,3). Histerese 1 m e 0,25 s; troca imediata ao receber passe/ganhar bola. Contra o pisca-pisca (pedido do usuário): quem está a ≤ 2 m da bola, de pé, não perde o controle por distância; logo após uma troca a margem começa 2 m maior e cai em 1,5 s; e não volta ao jogador anterior antes de 1,5 s (`CONTROL_*`). Indicador: triângulo para baixo na cor do uniforme, contorno `#1A1410` 2 px + filete creme.
- Dividida (chute sem bola): desliza 2,5 m em 0,35 s; janela ativa 0,12 s no meio; hitbox 0,45 m na ponta do pé. Acertou portador → bola solta 6 m/s e vítima cambaleia 0,5 s. Bola solta → empurra. Errou → caído 0,8 s. Recarga 1,2 s. Sem faltas. IA não dá carrinho.
- IA de linha: formação deslocada 30% X / 20% Y para a bola, presa à zona da função; defesa bloqueia entre portador e gol a ~2 m (se o jogador do humano já pressiona o portador, a ≤ 3 m, o marcador faz cobertura a 4,5 m: no mesmo lugar os dois disputavam o controle); ataque avança. IA nunca conduz (quem pega a bola vira controlado).
- Goleiro: na linha acompanhando Y (largura do gol ± 0,5), sai um pouco, preso à área; reação 0,15 s (+ variação); ≤ 15 m/s segura, acima espalma; segura 1 s e lança por cima para o mais livre. Bom mas batível.
- Partida: `SAIDA_DE_BOLA → JOGANDO → COMEMORACAO_GOL → …` + `INTERVALO`, `PRORROGACAO`, `PENALTIS`, `FIM`. 2 x 90 s; relógio só em `JOGANDO`; saída de bola (pedido do usuário): após 1 s apita, ninguém se mexe e o batedor não conduz — gira em volta da bola mirando só o próprio campo (até 90° da direção do próprio gol, seta no chão) e passa para um companheiro de linha; o passe põe a bola em jogo (prazo de 5 s, depois sai sozinho); troca de lado no 2º tempo e na 2ª metade da prorrogação; prorrogação 2 x 30 s sem gol de ouro; depois pênaltis.
- Pênaltis: 5 alternados (J1 começa), encerra cedo se impossível alcançar, depois morte súbita. Rodízio Atacante, AE, AD, Fixo. Cursor de mira com balanço, carga (baixa = rasteiro e fácil, > 90% risco de isolar), prazo 5 s. Goleiro sorteia E/C/D 40/20/40; defende se acertou a zona e a bola não está nos 15% externos; bola muito forte na zona certa passa 35%.

## Arte (anos 1930)

- Cores saturadas, sombras frias, contorno `#1A1410` com espessura variável. Boiling lines: 3 variações (±1,5 px) a ~12/s. Poses a 12–15 fps; física suave a 60.
- Jogadores rubber hose (membros em Bézier), olhos pie-cut, chuteiras grandes, luvas no goleiro, uniforme em camadas, número nas costas; vistas lateral/frente/costas; animações listadas na spec. Texturas só dos 2 times da partida, com tela de carregamento.
- Campo com faixas de corte, papel envelhecido, linhas irregulares; rede em perspectiva que balança no gol; paredes de madeira pintada.
- Arquibancada fundo + laterais, torcida dividida nas cores dos uniformes em campo, agita no ataque, comemora no gol.
- Placas: Marlburo, bet366, Chopp Brama, Asilo do Rods (azul e rosa sobre branco), Miami Hot — viram a cada 8 s (prisma de 3 faces). Só inspiradas, nunca copiadas.
- Clima sorteado (sem mudar física): sol sorridente, pôr do sol, noite com refletores (4 sombras), chuva.
- Efeitos: rastro > 15 m/s, partículas de grama, tremor + flash no gol, linhas de impacto. Filme antigo (grão, riscos, poeira, flicker ±3%, vinheta, papel) desligável na pausa.
- Comemoração ~3 s ("GOOOL!" elástico, jogador comemora, torcida pula, tremor, rede); passe pula após 1 s. Intertítulos de cinema mudo.

## Times (`data/teams.ts`)
PAL, COR, BAR, RMA, INT, MIL, LIV, CHE — uniformes fiéis (titular e reserva), escudos só em contorno com marcas leves. `sim/kits.ts`: cor de leitura; conflito → J2 reserva, ainda conflita → J1 reserva; mesmo time → J2 reserva. Escolha manual na seleção (`chooseKitsWith`): vale se a combinação não conflitar; quem está no automático se ajusta; escolha conflitante é recusada; mudar de time volta ao automático. Testes obrigatórios: COR×RMA, BAR×INT, MIL×LIV trocam; PAL×COR não. Goleiros: cores (laranja, verde-limão, cinza, rosa, amarelo, preto) maximizando diferença.

## Telas
Título (bola de futebol de pentágonos quicando) → Menu principal (modos) → Seleção (J1 esquerda / J2 direita, confirmar/desfazer; prévia do uniforme sem a linha que ferve, só respiração e balanço suaves) → VS (2,5 s, clima sorteado) → Partida → Pausa (Continuar, Reiniciar, Efeitos de filme, Volume, Som, Sair) → Resultado (Revanche, Trocar times, Menu principal).

## Fases
1. Base (Vite + TS + Phaser + Vitest + deploy) · 2. Campo e projeção (+ debug com `` ` ``) · 3. Entrada e movimento · 4. Bola (física, posse, passe, chute) · 5. Gol e fluxo da partida · 6. Troca automática + indicador · 7. Dividida · 8. IA de linha e goleiros · 9. Pênaltis · 10. Arte dos jogadores e bola · 11. Estádio, torcida, placas, climas · 12. Interface · 13. Efeitos · 14. Menus · 15. Polimento e deploy final.

Expansão: 16. Menu principal e refatoração dos modos (`GameMode`, `CommandSource`, `CombinedKeyboardSource`) · 17. Efeitos sonoros · 18. CPU do adversário · 19. Campeonato · 20. Online, conexão · 21. Online, partida · 22. Polimento e deploy.

## Expansão (fases 16–22)
- **Modos** (`core/modes.ts`): `GameMode = 'solo' | 'local' | 'online'`, passado entre as cenas (`MatchConfig.mode`; sem modo, inclusive no atalho `?t1=..&t2=..`, vale `'local'`). Uma só `MatchScene` para os três, sem duplicar a partida. O modo local continua idêntico.
- **Comandos** (`sim/command.ts`, puro): a simulação recebe um `TeamCommand` por time e por tick (`moveX`/`moveY` normalizados, `passPressed`, `shootHeld`, `shootReleased`, `shootPressed`); `HumanInputs = [TeamCommand, TeamCommand]` e a sim não importa mais `core/input`. Quem comanda é um `CommandSource` (`getCommand(tick)`); `isValidCommand` confere o que vier de fora. Campo opcional `aimDir` (-1/0/1): a mira do pênalti lida das teclas cruas pelas fontes de teclado (esquerda ou cima = -1, direita ou baixo = +1, as duas = 0), porque o direcional normalizado perde W+S+A (vira "esquerda", mas o cursor ficava parado); sem ele (CPU), a mira sai do direcional.
- **Fontes de teclado** (`core/sources.ts`): `KeyboardTickSampler` (um `snapshot` por tick; a partida lê pausa, debug e blur do mesmo quadro; `reset()` ao voltar da pausa, senão o quadro guardado reabriria a pausa), `LocalKeyboardSource(sampler, 0|1)` (um conjunto, igual ao mapeamento antigo) e `CombinedKeyboardSource` (os dois conjuntos para um jogador: opostas se anulam; F ou ; passa; G ou . é um botão lógico de chute). A `MatchScene` conta os ticks e monta as fontes pelo modo (`createSources`): local = `[Local(0), Local(1)]`; solo = `[Combined, CpuSource]` (fase 18); online nas fases 20/21.
- **Menu principal** (`MainMenuScene`): 1 JOGADOR — CAMPEONATO, 2 JOGADORES — LOCAL, ONLINE — SALA. Qualquer conjunto navega (W/S ou setas), F, ; ou Enter confirma, G ou . volta ao título. Voltar da seleção, "SAIR PARA O MENU" da pausa e "MENU PRINCIPAL" do resultado levam a ele. Modo ainda não ligado aparece esmaecido com o carimbo "EM BREVE" e confirmar nele não faz nada.
- **Som** (fase 17): `sim/sound.ts` (puro) transforma os eventos de cada passo em `SoundEvent` (`kick` com a força, `pass`, `whistle` com padrão `short`/`double`/`final`, `goal`, `save`; `x` = X da bola; `id` crescente): `stepMatch` anota quantos eventos havia, roda o passo (`advanceMatch`) e converte só os novos (por isso `setupKickoff` tira só o último evento de posse com `pop`). Apito: 1 curto na saída de bola e antes de cada pênalti, 2 curtos no fim de um tempo, 3 (o último longo) no fim de jogo — fim do 2º tempo com vencedor dá só os 3. A `MatchScene` drena `drainSounds` e chama `audio.playSound`. `AudioManager`: um `AudioContext` criado/retomado no primeiro `keydown`/`pointerdown`/`touchend` (captura na janela); cadeia voz → ganho → `StereoPanner` (±`AUDIO_PAN_MAX` pelo X) → passa-altas 150 Hz → passa-baixas 6 kHz → master (volume²) → proteção contra estouro (WaveShaper linear até `AUDIO_CLIP_KNEE`, curva tanh até 1 com `AUDIO_CLIP_HEADROOM`; medido: vários sons fortes juntos a 100% passavam de 1,6) → saída. `VoiceLimiter`: no máximo 2 vozes do mesmo tipo (corta a mais antiga com rampa curta). Tudo em try/catch (erro vira um `console.warn` só). Volume (passos de 10%) e mudo: tecla M em qualquer tela (`audio.hotkeyEnabled` desliga, para digitar código de sala) e opções VOLUME (A/D ou ←/→) e SOM na pausa; preferência em `localStorage` (`derby-pvp-som`, try/catch). `OverlayScene` (última da lista, lançada no Boot) mostra o aviso "SOM LIGADO · 80% (M)" / "SOM DESLIGADO (M)". Sons de interface (`audio.play('menu-…')`) ficam mudos nesta versão. Com `?debug`, o áudio fica em `window.derbyAudio`.
- **Decisões do usuário** (2026-10-13): no solo, a pausa troca "SAIR PARA O MENU" por "ABANDONAR CAMPEONATO" (com confirmação); no solo e no online os uniformes são só os da regra automática (`chooseKits`), H/vírgula só no local; push/deploy só no fim da fase 22.

## Decisões técnicas registradas
- Texturas procedurais são desenhadas com a API Canvas 2D (num canvas registrado como textura do Phaser) geradas no carregamento: o `Graphics` do Phaser não tem recorte (clip), gradiente no modo canvas nem texto com fonte, que são necessários para listras de uniforme, céu e placas. Continua 100% desenhado por código, sem imagens externas.
- Vários quadros de animação vão para um mesmo canvas (atlas) para reduzir trocas de textura.
- Animações que precisam bater com o relógio real (ex.: tela VS, que gera texturas em paralelo) são calculadas no `update` a partir do tempo real, não com tweens: o delta do Phaser é suavizado/limitado e atrasa em quadros longos.
- No `SHUTDOWN` da cena o Phaser destrói as câmeras antes dos nossos ouvintes: o `destroy()` das views não pode usar `cameras.main` sem checar se ainda existe.
- Texturas procedurais (fase 15): cada uma é desenhada num canvas próprio (`art/canvas.ts`) e registrada com `textures.addImage` só no fim, indo para a GPU uma vez só (o `createCanvas` do Phaser enviava o canvas vazio, guardava uma cópia dos pixels e reenviava no `refresh()`). O canvas é de CPU (`willReadFrequently`): medido numa Intel UHD, o canvas acelerado deixava a tela VS mais lenta no total.
- O Chrome só rasteriza o desenho de um canvas quando alguém lê os pixels. A geração dos jogadores é fatiada (`playerTextureSteps`): alguns quadros do atlas por passo, com a leitura de 1 pixel forçando o raster; todos os jogadores são rasterizados antes e depois enviados à GPU, um por quadro. `advanceArt` avança dentro de um orçamento por quadro que acompanha a duração do quadro (`ART_STEP_*`), para não demorar demais em máquinas lentas.
- Jogabilidade (fase 15, medida com partidas simuladas com bots): o receptor de um passe freia quando a bola chega (`PASS_RECEIVE_*`), senão quem corria ao encontro do passe somava a própria velocidade à da bola e ela desviava nele (metade dos passes); e amortece a bola que cai sobre ele (ela desce até os pés, onde vale a regra normal de domínio). O lançamento do goleiro sai acima da cabeça (`GK_THROW_RELEASE_Z`): saindo da altura das mãos, batia em quem estivesse colado no goleiro e entrava no próprio gol.
