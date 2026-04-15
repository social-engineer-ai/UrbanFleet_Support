-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OtpCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'verify_email',
    "expiresAt" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_OtpCode" ("code", "createdAt", "email", "expiresAt", "id", "used") SELECT "code", "createdAt", "email", "expiresAt", "id", "used" FROM "OtpCode";
DROP TABLE "OtpCode";
ALTER TABLE "new_OtpCode" RENAME TO "OtpCode";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
