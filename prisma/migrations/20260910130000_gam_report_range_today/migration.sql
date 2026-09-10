-- A operação decide o tráfego pelo desempenho do dia, então "hoje" passa a
-- ser a janela padrão. As conexões existentes ficaram com a janela antiga
-- por serem anteriores à escolha, e não por escolha: migram junto.
ALTER TABLE "GamConnection" ALTER COLUMN "reportRange" SET DEFAULT 'TODAY';

UPDATE "GamConnection" SET "reportRange" = 'TODAY'
  WHERE "reportRange" = 'LAST_7_DAYS';
