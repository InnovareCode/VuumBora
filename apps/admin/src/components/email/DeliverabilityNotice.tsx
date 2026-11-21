import { Info } from 'lucide-react';

/**
 * Aviso permanente sobre entregabilidade. O painel NÃO consegue verificar SPF
 * nem DKIM (isso é DNS do domínio do remetente) — então diz o que fazer, sem
 * fingir que checou.
 */
export function DeliverabilityNotice() {
  return (
    <aside aria-labelledby="deliverability-title" className="flex items-start gap-3 rounded-xxl border border-info/30 bg-info/10 px-4 py-4 sm:px-5">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
      <div className="min-w-0 space-y-1.5 text-small leading-relaxed text-text-secondary">
        <h2 id="deliverability-title" className="text-small font-bold text-text">
          Para o e-mail chegar na caixa de entrada
        </h2>
        <p>
          O domínio do remetente precisa ter <strong className="font-bold text-text">SPF</strong> e <strong className="font-bold text-text">DKIM</strong>{' '}
          configurados no DNS. Sem eles, provedores como Gmail e Outlook mandam a mensagem para o spam ou a recusam — mesmo com o teste
          dizendo que foi enviado.
        </p>
        <p>
          Os registros vêm do seu provedor de SMTP e são cadastrados no DNS do domínio. Este painel não consegue verificá-los: confira lá e
          faça um teste para uma caixa do Gmail para ver onde a mensagem cai.
        </p>
      </div>
    </aside>
  );
}
