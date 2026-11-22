// Sobe um `expo start --web` DE VERDADE (Metro ao vivo) para servir as telas durante
// captura/sondagem — substitui o antigo `server.mjs` (servidor estático sobre
// `expo export --platform web --dev`), removido.
//
// Por quê (achado Q9 da Íris, passada 8, docs/veredito-iris-s1-passada-8.md): o
// bundle de um `expo export --dev` pede módulos em `lazy=true` (visível na própria
// URL do bundle: `...&lazy=true...`) — o runtime do RN Web faz `require` de módulos
// por ID NUMÉRICO sob demanda, protocolo que só um Metro rodando sabe responder.
// Servido como arquivo estático, qualquer rota que dispare um desses requires quebra
// com "Requiring unknown module NNN". Não é um bug de configuração do servidor
// estático — é inerente ao formato do export `--dev`; corrigir exigiria mexer em
// `apps/*/metro.config.js` (fora da fronteira desta ferramenta) para desligar o lazy
// bundling do export, e mesmo assim o contrato de build (ver metro.config.js, F02)
// só permite identidade simulada com `development` + `NODE_ENV` != production — ou
// seja, a combinação "identidade simulada" só existe mesmo com o Metro de
// desenvolvimento rodando. Caminho escolhido: falar com o Metro vivo, igual ao
// `expo start --web` que qualquer dev usaria.

import { spawn } from 'node:child_process';
import http from 'node:http';
import { APPS_SRC } from './paths.mjs';

/** Portas fixas, ACIMA de 8100 (pedido do Atlas: outra sessão de QA pode estar usando
 * portas <= 8100 na mesma máquina ao mesmo tempo). Override por
 * QUALIDADE_TELA_PORTA_PASSAGEIRO / QUALIDADE_TELA_PORTA_MOTORISTA. */
const PORTAS_PADRAO = { passageiro: 8201, motorista: 8202 };

function porta(app) {
  const viaEnv = process.env[`QUALIDADE_TELA_PORTA_${app.toUpperCase()}`];
  return viaEnv ? Number(viaEnv) : PORTAS_PADRAO[app];
}

/** Espera até `url` responder QUALQUER coisa (mesmo 404 — só prova que o listener HTTP
 * do Metro já subiu; não exige 200 porque a rota "/" pode nem existir no app). */
function aguardarPronto(url, timeoutMs) {
  const prazo = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tentar = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > prazo) reject(new Error(`timeout esperando ${url} responder (${timeoutMs}ms)`));
        else setTimeout(tentar, 400);
      });
      req.setTimeout(3000, () => req.destroy());
    };
    tentar();
  });
}

/** Mata o processo (e a árvore toda: npx -> node -> workers do Metro). No Windows,
 * `spawn(..., {shell:true})` cria um cmd.exe intermediário — matar só o PID direto
 * deixaria os netos vivos; `taskkill /T` desce a árvore inteira. */
function matarArvore(pid) {
  return new Promise((resolve) => {
    if (pid === undefined) return resolve();
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F']).on('exit', () => resolve()).on('error', () => resolve());
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // já morto
      }
      resolve();
    }
  });
}

/**
 * Sobe `expo start --web` para `app` ('passageiro'|'motorista'). Devolve
 * `{ url, close() }` — igual à interface do antigo `iniciarServidorEstatico`, para não
 * precisar mexer em quem chama além da troca do import.
 *
 * `CI=1`: desliga file-watching/Fast Refresh (não precisamos — é uma captura única,
 * não uma sessão de edição) e isso também é o que deixa o bundle em `hot=false`.
 * `VUUMBORA_BUILD_PROFILE=development`: contrato de build do metro.config.js (F02) —
 * identidade simulada, sem API nem banco.
 */
export async function iniciarServidorDev(app, { timeoutMs = 90000 } = {}) {
  const porta_ = porta(app);
  const cwd = APPS_SRC[app];
  const url = `http://127.0.0.1:${porta_}`;
  const logs = [];

  // `shell: true` é obrigatório no Windows porque `npx` é um `.cmd` (script, não um
  // executável de verdade) — sem shell, `spawn('npx.cmd', [...])` falha com `EINVAL`
  // (mesma armadilha documentada para `npm.cmd` na memória do Vulcano). Passando o
  // comando como UMA STRING (em vez de comando+array de args), evita o aviso de
  // depreciação DEP0190 do Node (que só dispara quando `args` é um array não-vazio
  // junto de `shell: true`) — aqui não há nada vindo de fora para escapar, é tudo
  // literal fixo.
  const child = spawn(`npx expo start --web --port ${porta_}`, {
    cwd,
    shell: true,
    env: {
      ...process.env,
      CI: '1',
      VUUMBORA_BUILD_PROFILE: 'development',
      // runtime (não é a guarda do metro.config.js) pede EXPO_PUBLIC_API_URL mesmo em
      // development — as telas desta rodada usam identidade mock e não chamam a API.
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3101',
    },
  });
  child.stdout?.on('data', (d) => logs.push(d.toString()));
  child.stderr?.on('data', (d) => logs.push(d.toString()));

  try {
    await aguardarPronto(url, timeoutMs);
  } catch (err) {
    await matarArvore(child.pid);
    throw new Error(
      `[qualidade-tela] "expo start --web" (${app}, porta ${porta_}) não respondeu a tempo: ${err.message}\n` +
        `--- saída do processo ---\n${logs.join('').slice(-4000)}`,
    );
  }

  return {
    url,
    close: () => matarArvore(child.pid),
  };
}
