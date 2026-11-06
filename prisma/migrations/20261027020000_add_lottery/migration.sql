-- CreateTable
CREATE TABLE "Prize" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imagePath" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "stock" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isBlank" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DrawRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "prizeName" TEXT NOT NULL,
    "prizeImagePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrawRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DrawRecord_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Prize_enabled_sortOrder_idx" ON "Prize"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "DrawRecord_userId_createdAt_idx" ON "DrawRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DrawRecord_createdAt_idx" ON "DrawRecord"("createdAt");


-- 预置「谢谢参与」占位项：
-- 抽奖必须有未中奖落点，否则所有概率之和为 1，奖品必被抽空。
-- 它不是真实奖品，因此 isBlank = true，不会出现在奖品墙上。
-- 管理员可在后台调整权重（控制中奖率）或停用。
INSERT INTO "Prize" ("id", "name", "description", "imagePath", "weight", "stock", "enabled", "isBlank", "sortOrder", "createdAt", "updatedAt")
VALUES ('seed-thanks', '谢谢参与', '这次没抽中，明天再来～', NULL, 30, NULL, true, true, 999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);