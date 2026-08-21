-- Cadastro de maternidades — lista final confirmada com o cliente
-- (destrava a outra metade do item 4 da seção 13 do CLAUDE.md; pacotes já
-- estavam seedados, só maternidades e pessoas seguiam pendentes).
--
-- Mesmo padrão da migration de BIRTH+REELS (20260821090808): ON CONFLICT
-- DO NOTHING nesta migration E no bloco espelhado em supabase/seed.sql,
-- pra um `db reset` do zero não duplicar a linha nem quebrar por causa da
-- unique em maternidades.sigla, seja qual dos dois rodar primeiro.
--
-- A sigla precisa casar EXATAMENTE com o que public.parseEventoCalendar
-- (supabase/functions/_shared/parse-evento.ts) extrai do título do evento
-- do Calendar — maiúscula, sem espaço. São as mesmas 5 siglas já
-- cadastradas no parser (SIGLAS_MATERNIDADE): GNDI, HSC, HNSG, HNSF, CWB.
-- Isso não é coincidência a manter por sorte: é a ponta do parser e a
-- ponta do seed precisando concordar, e o teste
-- rpc_sync_upsert_caso.test.sql / seed_maternidades.test.sql prova isso.

insert into public.maternidades (nome, sigla) values
  ('Brígida', 'GNDI'),
  ('Santa Cruz', 'HSC'),
  ('Nossa Senhora das Graças', 'HNSG'),
  ('Curitiba', 'CWB'),
  ('Fátima', 'HNSF')
on conflict (sigla) do nothing;
