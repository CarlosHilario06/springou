-- Janela do relatório do Ad Manager, por conexão.
ALTER TABLE "GamConnection"
  ADD COLUMN "reportRange" TEXT NOT NULL DEFAULT 'LAST_7_DAYS';
