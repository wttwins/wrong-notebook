-- Add mistake-analysis fields to existing wrong-answer records.
ALTER TABLE "ErrorItem" ADD COLUMN "wrongAnswerText" TEXT;
ALTER TABLE "ErrorItem" ADD COLUMN "mistakeAnalysis" TEXT;
ALTER TABLE "ErrorItem" ADD COLUMN "mistakeStatus" TEXT;
