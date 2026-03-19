-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CONSULTANT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "project_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_users_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reqId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "shortDesc" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "when" TEXT NOT NULL,
    "where" TEXT NOT NULL,
    "howToday" TEXT NOT NULL,
    "howMuch" TEXT NOT NULL,
    "dependsOn" TEXT NOT NULL DEFAULT '',
    "providesFor" TEXT NOT NULL DEFAULT '',
    "consultantId" TEXT NOT NULL,
    "consultantNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "observations" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "requirements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "requirements_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requirementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OBSERVATION',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comments_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cross_matrix_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "fromReqId" TEXT NOT NULL,
    "toReqId" TEXT NOT NULL,
    "fromModule" TEXT NOT NULL,
    "toModule" TEXT NOT NULL,
    "dataFlow" TEXT,
    "dataFlowBack" TEXT,
    "integrationType" TEXT NOT NULL DEFAULT 'OTHER',
    "trigger" TEXT NOT NULL DEFAULT '',
    "timing" TEXT NOT NULL DEFAULT 'SYNC',
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "manualNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cross_matrix_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cross_matrix_entries_fromReqId_fkey" FOREIGN KEY ("fromReqId") REFERENCES "requirements" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cross_matrix_entries_toReqId_fkey" FOREIGN KEY ("toReqId") REFERENCES "requirements" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cross_matrix_entries_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "change_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requirementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changeType" TEXT NOT NULL DEFAULT 'UPDATE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "change_logs_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "change_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sprints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "goals" TEXT NOT NULL,
    "retrospective" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sprints_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "project_users_projectId_userId_key" ON "project_users"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "requirements_projectId_reqId_key" ON "requirements"("projectId", "reqId");

-- CreateIndex
CREATE UNIQUE INDEX "cross_matrix_entries_projectId_fromReqId_toReqId_key" ON "cross_matrix_entries"("projectId", "fromReqId", "toReqId");

-- CreateIndex
CREATE UNIQUE INDEX "sprints_projectId_sprintNumber_key" ON "sprints"("projectId", "sprintNumber");
