/**
 * B-6: baixar o texto legal, calcular o SHA-256 e SÓ entregá-lo se bater com o `sha256` publicado.
 * `fetch` e o cálculo do hash são injetados; o cálculo usa o `crypto.subtle` do Node (a mesma primitiva que o
 * `expo-crypto` chama no web), então os vetores abaixo provam a CONVERSÃO para hexadecimal e a comparação, não o módulo
 * nativo (esse só se prova no web real e em aparelho).
 */
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  bytesToHex,
  checkTextUrl,
  decodeUtf8Strict,
  fetchVerifiedText,
  parseHttpUrl,
  textToParagraphs,
  type FetchLike,
  type ResponseLike,
  type VerifiedTextRequest,
} from '../src/device/verifiedText';

const ENCODER = new TextEncoder();

/** Hash "de verdade": o `crypto.subtle` do Node → mesma conversão hexadecimal do app. */
const sha256Hex = async (bytes: Uint8Array): Promise<string> => bytesToHex(await webcrypto.subtle.digest('SHA-256', bytes));
const oracle = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const URL_OK = 'https://textos.vuumbora.com.br/terms/passenger/2026-11';
const TEXT = 'Termos de Uso do VuumBora\n\nA política de privacidade (versão 2026-11) trata dos seus dados: ação, coração.';
const TEXT_BYTES = ENCODER.encode(TEXT);
const TEXT_SHA = oracle(TEXT_BYTES);

function reply(body: Uint8Array, extra: Partial<ResponseLike> & { contentLength?: string } = {}): ResponseLike {
  const { contentLength, ...rest } = extra;
  return {
    ok: true,
    status: 200,
    url: URL_OK,
    headers: { get: (name) => (name.toLowerCase() === 'content-length' ? (contentLength ?? String(body.byteLength)) : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
    ...rest,
  };
}

function request(overrides: Partial<VerifiedTextRequest> & { response?: ResponseLike | (() => Promise<ResponseLike>) } = {}): {
  readonly input: VerifiedTextRequest;
  readonly calls: Array<{ url: string; init: Parameters<FetchLike>[1] }>;
} {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const { response, ...rest } = overrides;
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response() : (response ?? reply(TEXT_BYTES));
  };
  return { calls, input: { url: URL_OK, expectedSha256: TEXT_SHA, allowHttp: false, fetch, sha256Hex, ...rest } };
}

describe('SHA-256 em hexadecimal (vetores conhecidos)', () => {
  const vectors: Array<[string, Uint8Array, string]> = [
    ['"abc" (NIST)', ENCODER.encode('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['texto vazio', new Uint8Array(0), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    [
      '"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq" (NIST, 2 blocos)',
      ENCODER.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    ['um byte 0x00', new Uint8Array([0]), '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d'],
  ];
  for (const [name, bytes, expected] of vectors) {
    it(name, async () => {
      assert.equal(await sha256Hex(bytes), expected);
      assert.equal(oracle(bytes), expected, 'o vetor confere com o hash do Node');
    });
  }

  it('bytesToHex: zero à esquerda preservado, minúsculo, 2 caracteres por byte', () => {
    assert.equal(bytesToHex(new Uint8Array([0x00, 0x0a, 0xff, 0x10])), '000aff10');
    assert.equal(bytesToHex(new Uint8Array([0xab]).buffer), 'ab');
    assert.equal(bytesToHex(new Uint8Array(0)), '');
  });
});

describe('texto íntegro', () => {
  it('bate com o hash publicado: entrega o texto, o hash conferido e o tamanho', async () => {
    const { input, calls } = request();
    const result = await fetchVerifiedText(input);
    assert.ok(result.ok);
    assert.equal(result.text, TEXT);
    assert.equal(result.sha256, TEXT_SHA);
    assert.equal(result.byteLength, TEXT_BYTES.byteLength);
    assert.equal(calls.length, 1);
  });

  it('pede só a URL da resposta da API, com GET, sem cookie nem credencial nem cabeçalho de autorização (o pedido inteiro, campo a campo)', async () => {
    const { input, calls } = request({ createAbortController: () => ({ signal: 'sinal', abort: () => undefined }) });
    await fetchVerifiedText(input);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, URL_OK);
    assert.deepEqual(calls[0]?.init, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'text/plain, text/*;q=0.9, */*;q=0.1' },
      signal: 'sinal',
    });
  });

  it('o hash é dos BYTES: um BOM no começo faz parte do arquivo hasheado e é tirado só do texto exibido', async () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...TEXT_BYTES]);
    const { input } = request({ expectedSha256: oracle(withBom), response: reply(withBom) });
    const result = await fetchVerifiedText(input);
    assert.ok(result.ok);
    assert.equal(result.text, TEXT, 'sem o BOM no texto');
    // E o hash do arquivo SEM o BOM é outro: quem hasheou o texto "limpo" não bate com os bytes com BOM.
    const mismatch = await fetchVerifiedText(request({ expectedSha256: TEXT_SHA, response: reply(withBom) }).input);
    assert.equal(mismatch.ok, false);
  });

  it('quebra de linha CRLF não muda o hash esperado: o arquivo é hasheado como está', async () => {
    const crlf = ENCODER.encode(TEXT.replace(/\n/g, '\r\n'));
    const ok = await fetchVerifiedText(request({ expectedSha256: oracle(crlf), response: reply(crlf) }).input);
    assert.ok(ok.ok);
    const swapped = await fetchVerifiedText(request({ expectedSha256: TEXT_SHA, response: reply(crlf) }).input);
    assert.equal(swapped.ok, false, 'trocar LF por CRLF é outro arquivo');
  });
});

describe('texto adulterado ou hash divergente: NÃO exibe', () => {
  it('um caractere trocado no texto baixado → hash_mismatch e nenhum texto no resultado', async () => {
    const tampered = ENCODER.encode(TEXT.replace('Termos', 'Termas'));
    const result = await fetchVerifiedText(request({ response: reply(tampered) }).input);
    assert.deepEqual(result, { ok: false, reason: 'hash_mismatch' });
    assert.equal('text' in result, false);
  });

  it('um byte a mais no fim → hash_mismatch', async () => {
    const result = await fetchVerifiedText(request({ response: reply(new Uint8Array([...TEXT_BYTES, 0x20])) }).input);
    assert.deepEqual(result, { ok: false, reason: 'hash_mismatch' });
  });

  it('texto íntegro mas hash publicado diferente (o catálogo mudou) → hash_mismatch', async () => {
    const other = oracle(ENCODER.encode('outro texto'));
    const result = await fetchVerifiedText(request({ expectedSha256: other }).input);
    assert.deepEqual(result, { ok: false, reason: 'hash_mismatch' });
  });

  it('o hash zerado do mock nunca confere com conteúdo real', async () => {
    const result = await fetchVerifiedText(request({ expectedSha256: '0'.repeat(64) }).input);
    assert.deepEqual(result, { ok: false, reason: 'hash_mismatch' });
  });

  it('corpo vazio não confere (nem quando o hash esperado fosse o do vazio: texto vazio não se exibe)', async () => {
    const empty = new Uint8Array(0);
    const result = await fetchVerifiedText(request({ expectedSha256: oracle(empty), response: reply(empty) }).input);
    assert.deepEqual(result, { ok: false, reason: 'invalid_text' });
  });

  it('hash esperado malformado (maiúsculas, curto, com espaço) é recusado ANTES de qualquer rede', async () => {
    for (const bad of [TEXT_SHA.toUpperCase(), TEXT_SHA.slice(1), ` ${TEXT_SHA}`, '', 'zz'.repeat(32)]) {
      const { input, calls } = request({ expectedSha256: bad });
      assert.deepEqual(await fetchVerifiedText(input), { ok: false, reason: 'bad_expected_hash' });
      assert.equal(calls.length, 0, 'não houve requisição');
    }
  });

  it('hash bate mas os bytes não são UTF-8 válido → invalid_text (não mostra lixo)', async () => {
    const broken = new Uint8Array([0x54, 0xe7, 0x61]); // "T\xE7a": Latin-1, não UTF-8
    const result = await fetchVerifiedText(request({ expectedSha256: oracle(broken), response: reply(broken) }).input);
    assert.deepEqual(result, { ok: false, reason: 'invalid_text' });
  });
});

describe('endereço: só https (http só em desenvolvimento) e a origem da própria resposta', () => {
  it('http em produção → insecure_url, sem requisição', async () => {
    const { input, calls } = request({ url: 'http://textos.vuumbora.com.br/terms/passenger/1' });
    assert.deepEqual(await fetchVerifiedText(input), { ok: false, reason: 'insecure_url' });
    assert.equal(calls.length, 0);
  });

  it('http com allowHttp (desenvolvimento) é aceito', async () => {
    const url = 'http://localhost:8099/terms/passenger/1';
    const { input } = request({ url, allowHttp: true, response: reply(TEXT_BYTES, { url }) });
    assert.ok((await fetchVerifiedText(input)).ok);
  });

  it('esquemas que não são http(s) → bad_url, sem requisição', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/plain,oi', 'file:///etc/passwd', 'ftp://x.com/a', '//textos.com/a', 'textos.com/a', '', 'https://']) {
      const { input, calls } = request({ url, allowHttp: true });
      assert.deepEqual(await fetchVerifiedText(input), { ok: false, reason: 'bad_url' }, url);
      assert.equal(calls.length, 0, url);
    }
  });

  it('URLs que enganam o leitor do host → bad_url (credencial embutida, barra invertida, espaço, IPv6, controle)', async () => {
    for (const url of [
      'https://user:pass@textos.com/a',
      'https://textos.com@evil.com/a',
      'https://textos.com\\@evil.com/a',
      'https://bom.com\\.evil.com/a',
      'https://textos.com /a',
      'https://[::1]/a',
      'https://textos.com/a\nb',
      'https://textos_com/a',
      'https://-textos.com/a',
      'https://textos.com:99999/a',
      'https://textos.com:0/a',
    ]) {
      assert.equal(parseHttpUrl(url), null, JSON.stringify(url));
    }
  });

  it('origem normalizada: caixa e porta padrão não mudam a origem; outra porta muda', () => {
    assert.equal(parseHttpUrl('HTTPS://Textos.Vuumbora.com.br:443/a')?.origin, 'https://textos.vuumbora.com.br');
    assert.equal(parseHttpUrl('https://textos.vuumbora.com.br:8443/a')?.origin, 'https://textos.vuumbora.com.br:8443');
    assert.equal(parseHttpUrl('http://localhost:80/a')?.origin, 'http://localhost');
    assert.equal(checkTextUrl('https://textos.vuumbora.com.br', false).ok, true);
  });

  it('a URL FINAL em outra origem (redirecionamento) → redirected, mesmo com o conteúdo certo', async () => {
    for (const finalUrl of ['https://cdn.outro.com/terms/passenger/2026-11', 'http://textos.vuumbora.com.br/terms/passenger/2026-11', 'https://textos.vuumbora.com.br:8443/x']) {
      const result = await fetchVerifiedText(request({ response: reply(TEXT_BYTES, { url: finalUrl }) }).input);
      assert.deepEqual(result, { ok: false, reason: 'redirected' }, finalUrl);
    }
    const garbage = await fetchVerifiedText(request({ response: reply(TEXT_BYTES, { url: 'not a url' }) }).input);
    assert.deepEqual(garbage, { ok: false, reason: 'redirected' });
  });

  it('redirecionamento DENTRO da mesma origem é aceito; resposta sem URL final deixa o hash decidir', async () => {
    const same = await fetchVerifiedText(request({ response: reply(TEXT_BYTES, { url: 'https://textos.vuumbora.com.br/outro/caminho' }) }).input);
    assert.ok(same.ok);
    const noUrl = await fetchVerifiedText(request({ response: reply(TEXT_BYTES, { url: '' }) }).input);
    assert.ok(noUrl.ok);
    const noUrlTampered = await fetchVerifiedText(request({ response: reply(ENCODER.encode('adulterado'), { url: '' }) }).input);
    assert.deepEqual(noUrlTampered, { ok: false, reason: 'hash_mismatch' });
  });
});

describe('rede, status, tamanho e prazo', () => {
  it('fetch que rejeita → network', async () => {
    const { input } = request({ response: async () => Promise.reject(new Error('offline')) });
    assert.deepEqual(await fetchVerifiedText(input), { ok: false, reason: 'network' });
  });

  it('status não-2xx → http_status com o código', async () => {
    const { input } = request({ response: reply(TEXT_BYTES, { ok: false, status: 404 }) });
    assert.deepEqual(await fetchVerifiedText(input), { ok: false, reason: 'http_status', httpStatus: 404 });
  });

  it('corpo acima do teto → too_large (pelo Content-Length, sem ler, e pelo tamanho real)', async () => {
    const declared = request({ maxBytes: 100, response: reply(TEXT_BYTES, { contentLength: '5000' }) });
    assert.deepEqual(await fetchVerifiedText(declared.input), { ok: false, reason: 'too_large' });
    let read = false;
    const spy = reply(TEXT_BYTES, { contentLength: '5000', arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } });
    await fetchVerifiedText(request({ maxBytes: 100, response: spy }).input);
    assert.equal(read, false, 'não baixou o corpo declarado grande demais');

    const lying = request({ maxBytes: 20, response: reply(TEXT_BYTES, { contentLength: '10' }) });
    assert.deepEqual(await fetchVerifiedText(lying.input), { ok: false, reason: 'too_large' });
  });

  it('servidor calado além do prazo → timeout, e o pedido é cancelado', async () => {
    let aborted = false;
    const { input } = request({
      timeoutMs: 20,
      createAbortController: () => ({ signal: 'sinal', abort: () => { aborted = true; } }),
      response: () => new Promise<ResponseLike>((_resolve, reject) => setTimeout(() => reject(new Error('abortado')), 60)),
    });
    assert.deepEqual(await fetchVerifiedText(input), { ok: false, reason: 'timeout' });
    assert.equal(aborted, true);
  });

  it('o sinal de cancelamento vai no pedido', async () => {
    const { input, calls } = request({ createAbortController: () => ({ signal: 'sinal-123', abort: () => undefined }) });
    await fetchVerifiedText(input);
    assert.equal(calls[0]?.init.signal, 'sinal-123');
  });

  it('cálculo do hash indisponível (web fora de HTTPS) → hash_unavailable, e nunca exibe sem conferir', async () => {
    const { input } = request({ sha256Hex: async () => Promise.reject(new Error('Access to the WebCrypto API is restricted to secure origins')) });
    const result = await fetchVerifiedText(input);
    assert.deepEqual(result, { ok: false, reason: 'hash_unavailable' });
  });
});

describe('UTF-8 estrito (confrontado com o TextDecoder do Node)', () => {
  const strict = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const reference = (bytes: Uint8Array): string | null => {
    try {
      const text = strict.decode(bytes);
      return text.startsWith('﻿') ? text.slice(1) : text;
    } catch {
      return null;
    }
  };

  it('casos escolhidos: acentos, emoji de 4 bytes, e cada tipo de sequência inválida', () => {
    const cases: Array<[string, number[]]> = [
      ['ascii', [...ENCODER.encode('abc')]],
      ['acentos', [...ENCODER.encode('ação, coração, São Paulo')]],
      ['3 bytes (euro)', [...ENCODER.encode('€')]],
      ['4 bytes (emoji)', [...ENCODER.encode('🚗')]],
      ['limite U+10FFFF', [0xf4, 0x8f, 0xbf, 0xbf]],
      ['acima de U+10FFFF', [0xf4, 0x90, 0x80, 0x80]],
      ['byte 0xF5', [0xf5, 0x80, 0x80, 0x80]],
      ['continuação solta', [0x80]],
      ['0xC0 (forma longa)', [0xc0, 0x80]],
      ['0xC1 (forma longa)', [0xc1, 0xbf]],
      ['3 bytes em forma longa', [0xe0, 0x80, 0x80]],
      ['4 bytes em forma longa', [0xf0, 0x80, 0x80, 0x80]],
      ['substituto de UTF-16 (U+D800)', [0xed, 0xa0, 0x80]],
      ['cortada no fim (2 de 3)', [0xe2, 0x82]],
      ['cortada no fim (1 de 2)', [0xc3]],
      ['continuação inválida', [0xc3, 0x28]],
      ['só BOM', [0xef, 0xbb, 0xbf]],
      ['BOM + texto', [0xef, 0xbb, 0xbf, 0x61]],
      ['vazio', []],
      ['NUL no meio', [0x61, 0x00, 0x62]],
    ];
    for (const [name, bytes] of cases) {
      assert.equal(decodeUtf8Strict(new Uint8Array(bytes)), reference(new Uint8Array(bytes)), name);
    }
  });

  it('50 mil sequências aleatórias dão o mesmo resultado que o TextDecoder', () => {
    let seed = 123456789;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let round = 0; round < 50_000; round += 1) {
      const length = next() % 9;
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        // viés para os bytes que importam (inícios e continuações) para exercitar as bordas
        const pick = next() % 4;
        bytes[index] = pick === 0 ? next() & 0xff : pick === 1 ? 0x80 | (next() & 0x3f) : pick === 2 ? 0xc0 | (next() & 0x3f) : next() & 0x7f;
      }
      assert.equal(decodeUtf8Strict(bytes), reference(bytes), `bytes ${[...bytes].map((b) => b.toString(16)).join(' ')}`);
    }
  });

  it('texto longo (acima do bloco de 4096 pontos) sai inteiro', () => {
    const long = 'ção € 🚗 x'.repeat(2000);
    assert.equal(decodeUtf8Strict(ENCODER.encode(long)), long);
  });
});

describe('parágrafos', () => {
  it('separa por linha em branco, normaliza CRLF e descarta vazios', () => {
    assert.deepEqual(textToParagraphs('Um\r\n\r\nDois linha 1\nDois linha 2\n\n\n  \nTrês  '), ['Um', 'Dois linha 1\nDois linha 2', 'Três']);
    assert.deepEqual(textToParagraphs(''), []);
    assert.deepEqual(textToParagraphs('só um'), ['só um']);
  });
});
