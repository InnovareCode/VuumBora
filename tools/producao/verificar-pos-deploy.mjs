#!/usr/bin/env node
/**
 * Verificação pós-deploy — SÓ LEITURA, SEM credencial. Faz requisições HTTP comuns (as mesmas que
 * um navegador faria) contra os endereços públicos de produção, nunca contra o banco nem o painel
 * do Easypanel. Não grava nada, não precisa de `.env`, não precisa de senha.
 *
 * Uso (de qualquer pasta, com Node 18 ou mais novo instalado):
 *   node tools/producao/verificar-pos-deploy.mjs
 *
 * Para apontar para outro ambiente (por exemplo, antes do domínio definitivo estar no ar), três
 * variáveis opcionais sobrescrevem os padrões de produção:
 *   VUUMBORA_API_BASE=https://api.vuumbora.com.br node tools/producao/verificar-pos-deploy.mjs
 *   VUUMBORA_ADMIN_BASE=... VUUMBORA_SITE_BASE=... (mesma ideia)
 *
 * Leia o relatório de cima para baixo. Cada linha começa com:
 *   OK   — está como esperado, nada a fazer.
 *   AVISO — não é erro por si só; o texto explica o que conferir ou é uma pendência conhecida.
 *   FALHA — algo que deveria funcionar não funcionou; corrija antes de avisar os usuários.
 *
 * Se um domínio não responder (DNS ainda não propagou, certificado ainda não emitido, serviço
 * ainda não publicado), o script marca FALHA nesse bloco e segue para o próximo — uma falha de
 * rede não trava o resto da verificação.
 */

const API_BASE = (process.env.VUUMBORA_API_BASE || 'https://api.vuumbora.com.br').replace(/\/+$/, '');
const ADMIN_BASE = (process.env.VUUMBORA_ADMIN_BASE || 'https://admin.vuumbora.com.br').replace(/\/+$/, '');
const SITE_BASE = (process.env.VUUMBORA_SITE_BASE || 'https://www.vuumbora.com.br').replace(/\/+$/, '');
const PAINEL_BASE = (process.env.VUUMBORA_PAINEL_BASE || 'https://painel.vuumbora.com.br').replace(/\/+$/, '');

const TIMEOUT_MS = 10_000;

/** @type {{ nivel: 'OK' | 'AVISO' | 'FALHA', texto: string }[]} */
const relatorio = [];
const ok = (texto) => relatorio.push({ nivel: 'OK', texto });
const aviso = (texto) => relatorio.push({ nivel: 'AVISO', texto });
const falha = (texto) => relatorio.push({ nivel: 'FALHA', texto });

async function buscar(url, opcoes = {}) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(url, { signal: controlador.signal, redirect: 'manual', ...opcoes });
    const corpo = await resposta.text();
    return { resposta, corpo };
  } finally {
    clearTimeout(timer);
  }
}

function contarCabecalho(headers, nome) {
  // `Headers` do fetch já junta ocorrências repetidas com vírgula — isso é o bastante para
  // detectar "dois emissores de HSTS" (Traefik + nginx), que é o caso real que isto existe pra achar.
  const valor = headers.get(nome);
  if (!valor) return { presente: false, valor: null, repetido: false };
  // Duas cópias juntas pelo fetch ficam como "max-age=300, max-age=604800" (ou iguais) — vírgula sobra.
  const partes = valor.split(',').map((p) => p.trim()).filter(Boolean);
  return { presente: true, valor, repetido: partes.length > 1 };
}

async function checarApi() {
  console.log(`\n== API (${API_BASE}) ==`);

  try {
    const { resposta, corpo } = await buscar(`${API_BASE}/healthz`);
    if (resposta.status === 200 && corpo.includes('"status":"ok"')) {
      ok(`/healthz respondeu 200 com status "ok".`);
    } else if (resposta.status === 503) {
      falha(`/healthz respondeu 503 — API no ar, mas sem conseguir falar com o banco. Confira o serviço \`vuumbora-banco\` e a \`DATABASE_URL\`.`);
    } else {
      falha(`/healthz respondeu ${resposta.status} (esperado 200). Corpo: ${corpo.slice(0, 200)}`);
    }
  } catch (err) {
    falha(`/healthz não respondeu (${err.message}). A API está publicada e o domínio aponta para o serviço certo?`);
  }

  for (const perfil of ['passenger', 'driver']) {
    try {
      const { resposta, corpo } = await buscar(`${API_BASE}/v1/legal/current?audience=${perfil}`);
      if (resposta.status === 200) {
        let dados;
        try { dados = JSON.parse(corpo); } catch { dados = null; }
        const temHash = dados?.data?.terms?.sha256 && dados?.data?.privacy?.sha256;
        if (temHash) ok(`/v1/legal/current?audience=${perfil} respondeu 200, com termos e política publicados.`);
        else aviso(`/v1/legal/current?audience=${perfil} respondeu 200, mas o formato não é o esperado — confira à mão.`);
      } else if (resposta.status === 503) {
        aviso(`/v1/legal/current?audience=${perfil} respondeu 503 (consent_unavailable) — falta LEGAL_DOCUMENTS_BASE_URL ou a versão deste perfil ainda não foi publicada (passo 9.1 de docs/producao-passo-a-passo-dono.md). Antes de divulgar o cadastro, isto tem de virar 200.`);
      } else {
        falha(`/v1/legal/current?audience=${perfil} respondeu ${resposta.status} (esperado 200 ou 503). Corpo: ${corpo.slice(0, 200)}`);
      }
    } catch (err) {
      falha(`/v1/legal/current?audience=${perfil} não respondeu (${err.message}).`);
    }
  }
}

async function checarPainelAdmin() {
  console.log(`\n== Painel admin (${ADMIN_BASE}) ==`);

  try {
    const { resposta, corpo } = await buscar(`${ADMIN_BASE}/`);
    if (resposta.status === 200 && (corpo.includes('VuumBora Admin') || corpo.includes('id="root"'))) {
      ok(`A tela de login carrega (200, HTML do painel).`);
    } else {
      falha(`A home do painel respondeu ${resposta.status} ou não parece o HTML do painel. Serviço \`vuumbora-admin\` publicado?`);
    }

    const hsts = contarCabecalho(resposta.headers, 'strict-transport-security');
    if (!hsts.presente) aviso('strict-transport-security ausente — a imagem nova (com HSTS) ainda não foi publicada, ou o Traefik não está repassando o cabeçalho.');
    else if (hsts.repetido) falha(`strict-transport-security aparece MAIS DE UMA VEZ (${hsts.valor}) — dois emissores (nginx e Traefik/Cloudflare); o navegador usa só o primeiro e ninguém sabe qual. Deixe um emissor só.`);
    else ok(`strict-transport-security aparece uma vez só (${hsts.valor}).`);

    const csp = resposta.headers.get('content-security-policy');
    if (csp) ok('content-security-policy presente.');
    else falha('content-security-policy AUSENTE no painel admin — esperado sempre presente ali (diferente do site público).');

    const xfo = resposta.headers.get('x-frame-options');
    if (xfo === 'DENY') ok('x-frame-options: DENY.');
    else falha(`x-frame-options ausente ou diferente de DENY (valor: ${xfo ?? '(nenhum)'}).`);

    const nosniff = resposta.headers.get('x-content-type-options');
    if (nosniff === 'nosniff') ok('x-content-type-options: nosniff.');
    else falha(`x-content-type-options ausente ou diferente de nosniff (valor: ${nosniff ?? '(nenhum)'}).`);
  } catch (err) {
    falha(`Painel admin não respondeu (${err.message}). Domínio publicado com HTTPS?`);
  }
}

async function checarSite() {
  console.log(`\n== Site público (${SITE_BASE}) ==`);

  try {
    const { resposta } = await buscar(`${SITE_BASE}/`);
    if (resposta.status === 200) ok('Home do site responde 200.');
    else falha(`Home do site respondeu ${resposta.status} (esperado 200).`);

    const hsts = contarCabecalho(resposta.headers, 'strict-transport-security');
    if (!hsts.presente) aviso('strict-transport-security ausente no site.');
    else if (hsts.repetido) falha(`strict-transport-security aparece MAIS DE UMA VEZ no site (${hsts.valor}) — mesmo problema do painel, ver acima.`);
    else ok(`strict-transport-security aparece uma vez só (${hsts.valor}).`);

    const nosniff = resposta.headers.get('x-content-type-options');
    if (nosniff === 'nosniff') ok('x-content-type-options: nosniff.');
    else falha(`x-content-type-options ausente ou diferente de nosniff no site (valor: ${nosniff ?? '(nenhum)'}).`);

    const csp = resposta.headers.get('content-security-policy');
    if (!csp) ok('content-security-policy ausente no site — é o esperado hoje (pendência registrada em docs/publicar-o-backend.md).');
    else aviso('content-security-policy agora presente no site — se foi intencional (fechou a pendência), ignore este aviso.');
  } catch (err) {
    falha(`Site público não respondeu (${err.message}).`);
  }
}

async function checarPainelEasypanel() {
  console.log(`\n== Painel do Easypanel (${PAINEL_BASE}) — informativo ==`);
  try {
    const { resposta } = await buscar(`${PAINEL_BASE}/`);
    if (resposta.status >= 200 && resposta.status < 400) ok(`Responde (status ${resposta.status}), com HTTPS.`);
    else aviso(`Respondeu ${resposta.status}. Confira à mão se é a tela de login.`);
  } catch (err) {
    aviso(`Não respondeu (${err.message}) — se o passo 2 de docs/producao-passo-a-passo-dono.md ainda não foi feito, é esperado.`);
  }
}

async function main() {
  console.log('Verificação pós-deploy do VuumBora — só leitura, sem credencial.');
  console.log(`API: ${API_BASE} | Admin: ${ADMIN_BASE} | Site: ${SITE_BASE} | Painel Easypanel: ${PAINEL_BASE}`);

  await checarApi();
  await checarPainelAdmin();
  await checarSite();
  await checarPainelEasypanel();

  console.log('\n== Resumo ==');
  const totais = { OK: 0, AVISO: 0, FALHA: 0 };
  for (const item of relatorio) {
    totais[item.nivel] += 1;
    const marca = item.nivel === 'OK' ? '✔' : item.nivel === 'AVISO' ? '!' : '✘';
    console.log(`[${marca}] ${item.nivel.padEnd(5)} ${item.texto}`);
  }
  console.log(`\n${totais.OK} OK, ${totais.AVISO} aviso(s), ${totais.FALHA} falha(s).`);

  if (totais.FALHA > 0) {
    console.log('\nHá pelo menos uma FALHA acima — não divulgue nem dê o deploy como concluído até resolver.');
    process.exitCode = 1;
  } else if (totais.AVISO > 0) {
    console.log('\nSem falha, mas leia os avisos: podem ser pendência conhecida (ex.: textos legais ainda não publicados).');
  } else {
    console.log('\nTudo certo.');
  }
}

main().catch((err) => {
  console.error('Erro inesperado ao rodar a verificação:', err);
  process.exitCode = 1;
});
