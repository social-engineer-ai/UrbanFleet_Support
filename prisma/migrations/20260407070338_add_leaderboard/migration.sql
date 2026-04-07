-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "baselineScore" INTEGER NOT NULL DEFAULT 0,
    "enhancedScore" INTEGER NOT NULL DEFAULT 0,
    "innovationScore" INTEGER NOT NULL DEFAULT 0,
    "qualityMultiplier" REAL NOT NULL DEFAULT 1.0,
    "finalScore" REAL NOT NULL DEFAULT 0,
    "scenarioResults" TEXT NOT NULL DEFAULT '{}',
    "auditedAt" DATETIME,
    "auditNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeaderboardEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeaderboardBonus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "bonus" INTEGER NOT NULL
);
