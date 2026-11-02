# STARFALL — Beyond the Last Orbit

Jogo de plataforma 2D de ação e aventura espacial, feito em HTML5 Canvas, CSS e JavaScript puro. A arte é desenhada em tempo real em resolução interna de 384 × 216 pixels, com renderização pixelada para uma identidade 16-bit.

## Jogar localmente

Abra `index.html` em um navegador moderno. Para testar a instalação PWA e o Service Worker, use HTTPS ou um servidor local (por exemplo, Live Server). O Service Worker não é ativado em `file://`.

## Publicar no GitHub Pages

1. Envie todos os arquivos e pastas deste projeto para a raiz de um repositório.
2. No GitHub, abra **Settings → Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Escolha `main` e `/ (root)` e salve.
5. Abra a URL publicada. Depois da primeira visita online, os arquivos essenciais ficam disponíveis em cache para uso offline.

O projeto usa caminhos relativos para funcionar tanto na raiz quanto em um endereço do tipo `usuario.github.io/repositorio/`.

## Controles

### Computador
- `A` / `←`: mover para a esquerda.
- `D` / `→`: mover para a direita.
- `Espaço`, `W` ou `↑`: pular.
- `J` ou `X`: disparar.
- `K`, `Z` ou `Shift`: impulso (desbloqueado após concluir Órbita Zero).
- `Esc` ou `P`: pausar/continuar.
- `Enter`: confirmar nos menus.
- `R` no menu inicial: iniciar um novo jogo, apagando o progresso salvo.

### Celular
Use os botões na tela. O jogo foi pensado para ser jogado na horizontal.

## Progressão

- Cinco regiões com cenários, inimigos e chefes próprios.
- Cristais coletáveis e checkpoints.
- Ao concluir Órbita Zero, o impulso e o pulo duplo ficam desbloqueados permanentemente.
- O progresso, as regiões concluídas, os cristais e a preferência de som são salvos no `localStorage` do navegador.

## PWA

`manifest.json` contém os metadados e ícones. `sw.js` faz cache dos arquivos essenciais e remove versões antigas do cache. Para mudanças futuras, atualize a constante `CACHE` no `sw.js` para publicar uma nova versão.

## Observações técnicas

- Sem backend, login, APIs externas ou bibliotecas obrigatórias.
- O jogo funciona offline depois de carregado e armazenado pelo Service Worker.
- O progresso fica no dispositivo/navegador atual; não há sincronização entre aparelhos.
- Os efeitos sonoros são sintetizados via Web Audio API.
