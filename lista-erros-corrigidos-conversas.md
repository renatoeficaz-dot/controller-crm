# Auditoria de conversas — erros corrigidos (01/10 a 22/10/2026)

Cobertura: todas as conversas de leads de 08/10 a 22/10, os 51 leads ativos (relidos após os deploys) e varreduras por padrão de erro em 01/10–07/10. Todas as correções estão no ar na VPS (lead + causa no código).

## Decisões erradas da IA

| # | Erro | Exemplo | Correção |
|---|------|---------|----------|
| 1 | Lead perdido como "robô" (cartão de contato repetido contava como mensagem repetida) | Gislene | `lib/fluxoIa.js`: cartão `📇` ignorado na regra das 3 mensagens iguais |
| 2 | IA respondendo/perdendo cliente enquanto o cobrador conversava | aleh, Fusca, Bella | Guarda de conversa humana (24h, 2+ mensagens humanas) no webhook e no follow-up |
| 3 | "Não tenho CNPJ" restaurava o lead como MEI e mandava 2 mensagens contraditórias | Natasha, Erika | Negação na restauração MEI (`webhookCommon.js`, `reprocessarSemResposta.js`) |
| 4 | "Sem ponto fixo" perdia quem tinha comércio/salão e atendia em casa | ekaterinadalima, Luís Faria | `afirmaPonto` e exceção do `domicilioRe` ampliados |
| 5 | Motorista de app perdido junto com "meu comércio é virtual" | Ariel | `restaurarAppPerdidos()` na varredura + restauração manual |
| 6 | Cancelamento não reconhecido ("Encerrar", "não vou ter interesse", "não, obrigado") | vários | Frases de desistência ampliadas |
| 7 | "É só diária?" tratado como desistência | Delociâ | Exemplo corrigido no leitor (pergunta, não cancelamento) |
| 17 | Desistência condicional ("senão não quero prosseguir") cancelava o lead | Digaoo, áudio de 09/10 | `desistenciaCondicional` bloqueia o cancelamento |

## Falhas técnicas

| # | Erro | Correção |
|---|------|----------|
| 8 | Falha da API de visão virava "Não consegui identificar o arquivo" | Retry 3x; se falhar, não responde ao cliente |
| 9 | Mensagem literal "null" enviada a 4 clientes | Filtro em `responderDuvida` e em `sendWhatsappText` |
| 10 | Arquivo recusado/grande demais sem aviso (Glauco, Marcia) | Aviso pedindo para reenviar |
| 11 | Lembrete agendado saindo depois do lead perdido ou com item errado (Wigna, Sergio) | Lembrete cancelado/regenerado |
| 12 | "Estamos analisando" por cima do cobrador | Não sai se houve fala humana em 2h |
| 16 | ~440 mensagens da IA não entregues (instância fora do ar em 14–15/10), incluindo 81 críticas ("perfil não aprovado", "valor enviado") | `lib/reenviarFalhas.js`: reenvio automático a cada 5 min (15 por ciclo, pausa); falha definitiva da API vira "falhou". 57 reenviadas; as outras 24 ficaram de fora de propósito (cliente já voltou a escrever) |

## Leads parados / sem resposta

| # | Erro | Correção |
|---|------|----------|
| 13 | Lead parado após "ok" ou sequência quebrada (joi 5r, Sheriff, Thaiana…) | `retomarAcenos` no follow-up (confirmado em produção) |
| 14 | Respostas inconsistentes (ligação, itens obrigatórios) | 3 fatos novos na base de conhecimento |
| 15 | IA dizia que o contato do comércio "precisa ser outro número", mas o código aceita o próprio número | Base de conhecimento alinhada ao código (Silvestre Gonzaga) |
| 18 | Lead perdido que volta pelo formulário/anúncio ficava sem resposta (Viviane Corrêa: 5h sem resposta) | Reabertura em "Novo" no webhook (motivos: Não respondeu, Sem documento, cancelou, Sem CNPJ, Sem ponto fixo, Não diário; fraude/CLT não reabrem). 10 leads reabertos e atendidos |
| 19 | Cliente respondia "Meu CNPJ" + "Não tá ativo mais" e recebia duas mensagens contraditórias (IA pedindo Motorista/Comerciante e, 15 s depois, "perfil não aprovado") | Juliana Amaral | `lib/fluxoIa.js`: "não tá ativo / inativo / baixado" no passo do CNPJ passa a valer como CNPJ inativo (regra única). No ar na VPS; teste e2e: "Meu CNPJ" + "Não tá ativo mais" → Venda perdida (Sem CNPJ) sem a mensagem contraditória; "Meu CNPJ está ativo" segue normal |
| 20 | "Tenho cnpj não mano" lido como "tem CNPJ": a IA insistiu em pedir o número e o lead só foi perdido na 2ª vez (13h depois) | Gabriel nascimento | `lib/fluxoIa.js`: frases "tenho cnpj não", "não tenho/possuo cnpj" valem como Sem CNPJ na hora |
| 21 | Cliente pagando parcela com o cobrador mandou o comprovante e a IA o moveu para Documentação e perguntou "Motorista ou comerciante?" | Kauane Antunes | `lib/webhookCommon.js`: foto/documento não move para Documentação se houve 2+ mensagens humanas em 24h; `lib/fluxoIa.js`: a guarda de conversa humana vale também em Documentação sem funil iniciado. Lead voltou para Novo com IA pausada |

## Decisões que ficaram com você

- **CNPJ inativo com alvará:** cliente que diz ter MEI inativo (falta de declaração) e alvará é perdida como "Sem CNPJ". Regra mantida.
- **Kevin Augusto:** documentação completa, parado em "Em conversa" desde 19/10 por ação do Arthur.
- **Comprovante em nome de terceiros** (vkayan) e **documento do motorista BlaBlaCar** (Jose Marcelo).
- Restauração opcional de Tarcisio e luiziane; Juliana Fonseca Cerque (9 parcelas); Alberico/Marlene; duplicata Bruna/Solange.
- WABA continua sem credenciais da Meta.
- Mensagens duras dos cobradores não são erro da IA.
