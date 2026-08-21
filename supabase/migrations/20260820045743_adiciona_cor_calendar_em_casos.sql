-- Cor herdada do evento no Google Calendar, não interpretada (seção 7 do
-- CLAUDE.md). O Quadro só herda e exibe; o sistema não decodifica o
-- significado da cor (organização interna do cliente).

alter table public.casos
  add column cor_calendar text;

comment on column public.casos.cor_calendar is
  'Cor herdada do evento no Google Calendar, sem interpretação. Valor esperado é o colorId retornado pela API do Calendar (paleta fixa de "1" a "11"), não um código hex. O sistema apenas herda e exibe — nunca decodifica o que a cor significa.';
