-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Splitter" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT,
    "projectId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Splitter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitterTab" (
    "id" SERIAL NOT NULL,
    "tab" TEXT NOT NULL,
    "splitterId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitterTab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Link" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT,
    "tab" TEXT NOT NULL DEFAULT '1',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "utms" JSONB,
    "probability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ecpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "splitterId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitterRoute" (
    "id" SERIAL NOT NULL,
    "domain" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pixelId" TEXT,
    "loaderTitle" TEXT,
    "loaderSubtitle" TEXT,
    "tab" TEXT NOT NULL DEFAULT '1',
    "splitterId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitterRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamConnection" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "networkCode" TEXT NOT NULL,
    "reportType" TEXT NOT NULL DEFAULT 'utm_campaign',
    "reportId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Splitter_projectId_idx" ON "Splitter"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SplitterTab_splitterId_tab_key" ON "SplitterTab"("splitterId", "tab");

-- CreateIndex
CREATE INDEX "Link_splitterId_tab_disabled_idx" ON "Link"("splitterId", "tab", "disabled");

-- CreateIndex
CREATE INDEX "SplitterRoute_slug_idx" ON "SplitterRoute"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SplitterRoute_domain_slug_key" ON "SplitterRoute"("domain", "slug");

-- AddForeignKey
ALTER TABLE "Splitter" ADD CONSTRAINT "Splitter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitterTab" ADD CONSTRAINT "SplitterTab_splitterId_fkey" FOREIGN KEY ("splitterId") REFERENCES "Splitter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_splitterId_fkey" FOREIGN KEY ("splitterId") REFERENCES "Splitter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitterRoute" ADD CONSTRAINT "SplitterRoute_splitterId_fkey" FOREIGN KEY ("splitterId") REFERENCES "Splitter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
