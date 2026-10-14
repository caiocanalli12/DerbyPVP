# Derby PVP

Futebol 5x5 para navegador, para **2 jogadores no mesmo teclado**, com visual de desenho animado dos anos 1930.

Feito com TypeScript, Phaser 3.80.1 e Vite. Tudo (jogadores, estádio, torcida, placas) é desenhado por código: não há imagens externas.

## Menu principal

Depois da tela inicial, o menu principal mostra os modos de jogo:

- **1 JOGADOR — CAMPEONATO**: você contra o computador num mata-mata de 8 times (veja abaixo).
- **2 JOGADORES — LOCAL**: os dois jogadores no mesmo teclado (o jogo descrito abaixo).
- **ONLINE — SALA**: aparece marcado como *EM BREVE* e chega numa próxima versão.

Qualquer um dos dois conjuntos de teclas navega no menu (W/S ou setas); F, `;` ou Enter confirma e G ou `.` volta para a tela inicial.

## Controles

| Ação | Jogador 1 (time da esquerda) | Jogador 2 (time da direita) |
|---|---|---|
| Mover | W A S D | Setas |
| Passe | F | `;` (ponto e vírgula) |
| Chute (segure para carregar) / dividida sem a bola | G | `.` (ponto) |
| Pausa | Esc ou P | Esc ou P |
| Som liga/desliga | M | M |

Nos menus: J1 usa W/A/S/D, F confirma e G volta; J2 usa as setas, `;` confirma e `.` volta. Enter também confirma.

Na escolha de times, cada jogador troca entre o uniforme 1 (titular) e o 2 (reserva): **H** para o J1 e **`,`** (vírgula) para o J2. Se a combinação deixar os dois times com cores parecidas, a troca é recusada (e quem não escolheu se ajusta sozinho).

O `;` funciona tanto no teclado brasileiro (ABNT2, tecla ao lado do `.`) quanto no americano.

> **Aviso sobre teclados:** alguns teclados mais simples não conseguem registrar muitas teclas apertadas ao mesmo tempo (*ghosting*). Se um comando "sumir" quando os dois jogadores apertam várias teclas juntos, é limitação do hardware do teclado, não um bug do jogo.

## Som

Os efeitos sonoros (chute, passe, apito, gol e defesa) são sintetizados na hora pelo navegador (Web Audio), com timbre de rádio antigo; não há arquivos de áudio. Por regra dos navegadores, o som só começa depois do primeiro clique ou tecla. **M** liga e desliga o som em qualquer tela, e o menu de pausa tem o volume (A/D ou ←/→) e a opção de som. A escolha fica salva no navegador.

## 1 Jogador — Campeonato

Escolha o seu time e a dificuldade: **FÁCIL** (adversários fácil nas quartas, médio na semifinal e na final) ou **DIFÍCIL** (fácil, médio e um adversário difícil na final). Os outros 7 times são sorteados numa chave de quartas de final, semifinal e final; antes de cada jogo a chave mostra o adversário e o nível dele em estrelas. Os outros jogos de cada fase são simulados e o placar aparece na chave. Perdeu, está eliminado; ganhou a final, é campeão.

No modo solo você joga com o time da esquerda e pode usar **os dois conjuntos de teclas ao mesmo tempo** (WASD + F + G e setas + `;` + `.`). Na pausa, *Abandonar campeonato* encerra o campeonato (pede confirmação).

Para testar: uma partida avulsa contra o computador abre com `?cpu=facil`, `?cpu=medio` ou `?cpu=dificil` no endereço (por exemplo, `http://localhost:5173/?cpu=medio&t1=PAL&t2=COR`).

## Rodando localmente

Requer Node.js 20 ou mais novo.

```bash
npm install
npm run dev      # servidor de desenvolvimento (abre em http://localhost:5173)
npm run build    # checagem de tipos (TypeScript strict) + build de produção em dist/
npm run test     # testes da simulação (Vitest)
npm run preview  # serve o build de dist/ localmente
```

## Publicando no GitHub Pages

O deploy é automático via GitHub Actions (`.github/workflows/deploy.yml`): a cada push na branch `main`, os testes rodam, o build é gerado e a pasta `dist` é publicada.

Para ativar (só uma vez):

1. Crie um repositório no GitHub e envie o projeto para a branch `main`.
2. No repositório, vá em **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **GitHub Actions**.
4. Faça um push na `main` (ou rode o workflow manualmente em **Actions → Deploy no GitHub Pages → Run workflow**).
5. Quando o workflow terminar, o endereço aparece em **Settings → Pages** (algo como `https://SEU-USUARIO.github.io/NOME-DO-REPO/`).

O `vite.config.ts` usa `base: './'`, então o jogo funciona em qualquer subpasta do Pages sem configuração extra.
